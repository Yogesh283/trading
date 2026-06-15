package com.iqfxpro.trade;

import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Log;

import androidx.annotation.NonNull;

import com.getcapacitor.BridgeActivity;
import com.google.android.gms.ads.AdError;
import com.google.android.gms.ads.AdRequest;
import com.google.android.gms.ads.FullScreenContentCallback;
import com.google.android.gms.ads.LoadAdError;
import com.google.android.gms.ads.MobileAds;
import com.google.android.gms.ads.interstitial.InterstitialAd;
import com.google.android.gms.ads.interstitial.InterstitialAdLoadCallback;

/**
 * Capacitor shell + Google Mobile Ads (interstitial only).
 * Ad unit IDs live in res/values/strings.xml.
 */
public class MainActivity extends BridgeActivity {

    private static final String TAG = "IqfxAdMob";
    private static final long AD_INTERVAL_MS = 300_000L;

    private InterstitialAd interstitialAd;
    private boolean interstitialLoadRequested;
    private boolean interstitialShowing;
    private boolean startupAdShown;

    private long lastAdShownElapsedMs;

    private final Handler adHandler = new Handler(Looper.getMainLooper());
    private final Runnable showScheduledInterstitial =
        new Runnable() {
            @Override
            public void run() {
                showInterstitial();
            }
        };

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        initAdMob();
    }

    private void initAdMob() {
        final String appId = getString(R.string.admob_app_id);
        Log.i(TAG, "Initializing Mobile Ads SDK, APPLICATION_ID=" + appId);

        MobileAds.initialize(
            this,
            initStatus -> {
                Log.i(TAG, "Mobile Ads SDK ready: " + initStatus);
                runOnUiThread(this::loadInterstitial);
            }
        );
    }

    private void loadInterstitial() {
        if (interstitialLoadRequested) {
            return;
        }
        interstitialLoadRequested = true;

        final String unitId = getString(R.string.admob_interstitial_unit_id);
        Log.i(TAG, "Loading interstitial ad, unitId=" + unitId);

        InterstitialAd.load(
            this,
            unitId,
            new AdRequest.Builder().build(),
            new InterstitialAdLoadCallback() {
                @Override
                public void onAdLoaded(@NonNull InterstitialAd ad) {
                    interstitialAd = ad;
                    interstitialLoadRequested = false;
                    Log.i(TAG, "Interstitial ad loaded");
                    ad.setFullScreenContentCallback(
                        new FullScreenContentCallback() {
                            @Override
                            public void onAdDismissedFullScreenContent() {
                                interstitialAd = null;
                                interstitialShowing = false;
                                Log.i(TAG, "Interstitial dismissed — preloading next ad");
                                loadInterstitial();
                                scheduleNextInterstitial();
                            }

                            @Override
                            public void onAdFailedToShowFullScreenContent(
                                @NonNull AdError error
                            ) {
                                interstitialAd = null;
                                interstitialShowing = false;
                                Log.e(
                                    TAG,
                                    "Interstitial show failed: " + error.getMessage()
                                );
                                loadInterstitial();
                                scheduleNextInterstitial();
                            }

                            @Override
                            public void onAdShowedFullScreenContent() {
                                lastAdShownElapsedMs = SystemClock.elapsedRealtime();
                                Log.i(TAG, "Interstitial showed");
                            }
                        }
                    );

                    if (!startupAdShown) {
                        showInterstitial();
                    }
                }

                @Override
                public void onAdFailedToLoad(@NonNull LoadAdError error) {
                    interstitialLoadRequested = false;
                    Log.e(
                        TAG,
                        "Interstitial ad failed: code="
                            + error.getCode()
                            + " message="
                            + error.getMessage()
                    );
                }
            }
        );
    }

    private void scheduleNextInterstitial() {
        adHandler.removeCallbacks(showScheduledInterstitial);
        adHandler.postDelayed(showScheduledInterstitial, AD_INTERVAL_MS);
        Log.i(TAG, "Next interstitial scheduled in " + (AD_INTERVAL_MS / 1000) + "s");
    }

    private void rescheduleInterstitialIfNeeded() {
        if (!startupAdShown || lastAdShownElapsedMs == 0) {
            return;
        }

        adHandler.removeCallbacks(showScheduledInterstitial);

        final long elapsed = SystemClock.elapsedRealtime() - lastAdShownElapsedMs;
        if (elapsed >= AD_INTERVAL_MS) {
            showInterstitial();
        } else {
            final long remaining = AD_INTERVAL_MS - elapsed;
            adHandler.postDelayed(showScheduledInterstitial, remaining);
            Log.i(TAG, "Next interstitial scheduled in " + (remaining / 1000) + "s");
        }
    }

    private void showInterstitial() {
        if (interstitialAd == null || interstitialShowing || isFinishing()) {
            return;
        }
        interstitialShowing = true;
        startupAdShown = true;
        Log.i(TAG, "Showing interstitial ad");
        interstitialAd.show(this);
    }

    @Override
    public void onResume() {
        super.onResume();
        rescheduleInterstitialIfNeeded();
    }

    @Override
    public void onPause() {
        adHandler.removeCallbacks(showScheduledInterstitial);
        super.onPause();
    }

    @Override
    public void onDestroy() {
        adHandler.removeCallbacks(showScheduledInterstitial);
        interstitialAd = null;
        super.onDestroy();
    }
}
