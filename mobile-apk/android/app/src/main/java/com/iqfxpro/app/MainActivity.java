package com.iqfxpro.app;

import android.os.Bundle;
import android.util.Log;
import android.view.Gravity;
import android.widget.FrameLayout;

import androidx.annotation.NonNull;

import com.getcapacitor.BridgeActivity;
import com.google.android.gms.ads.AdError;
import com.google.android.gms.ads.AdRequest;
import com.google.android.gms.ads.AdSize;
import com.google.android.gms.ads.AdView;
import com.google.android.gms.ads.FullScreenContentCallback;
import com.google.android.gms.ads.LoadAdError;
import com.google.android.gms.ads.MobileAds;
import com.google.android.gms.ads.interstitial.InterstitialAd;
import com.google.android.gms.ads.interstitial.InterstitialAdLoadCallback;

/**
 * Capacitor shell + Google Mobile Ads (banner + optional test interstitial).
 * Replace admob_* strings in res/values/strings.xml with your AdMob dashboard IDs.
 */
public class MainActivity extends BridgeActivity {

    private static final String TAG = "IqfxAdMob";

    private AdView bannerAdView;
    private InterstitialAd interstitialAd;
    private boolean interstitialRequested;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        initAdMob();
    }

    private void initAdMob() {
        final String appId = getString(R.string.admob_app_id);
        Log.i(TAG, "Initializing Mobile Ads SDK, APPLICATION_ID=" + appId);

        MobileAds.initialize(this, initStatus -> {
            Log.i(TAG, "Mobile Ads SDK ready: " + initStatus);
            runOnUiThread(() -> {
                attachBannerAd();
                if (isGoogleTestAdMobConfig()) {
                    loadTestInterstitial();
                }
            });
        });
    }

    /** Google sample publisher — interstitial auto-show only for test IDs. */
    private boolean isGoogleTestAdMobConfig() {
        return getString(R.string.admob_app_id).contains("3940256099942544");
    }

    private void attachBannerAd() {
        if (bannerAdView != null) {
            return;
        }

        FrameLayout root = findViewById(android.R.id.content);
        if (!(root instanceof FrameLayout)) {
            Log.e(TAG, "Cannot attach banner — content root is not FrameLayout");
            return;
        }

        String unitId = getString(R.string.admob_banner_unit_id);
        bannerAdView = new AdView(this);
        bannerAdView.setAdUnitId(unitId);
        bannerAdView.setAdSize(
            AdSize.getCurrentOrientationAnchoredAdaptiveBannerAdSize(this, AdSize.FULL_WIDTH)
        );

        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.WRAP_CONTENT
        );
        lp.gravity = Gravity.BOTTOM;
        root.addView(bannerAdView, lp);

        Log.i(TAG, "Loading banner ad request, unitId=" + unitId);
        bannerAdView.setAdListener(new com.google.android.gms.ads.AdListener() {
            @Override
            public void onAdLoaded() {
                Log.i(TAG, "Banner ad loaded — request succeeded (test or live unit)");
            }

            @Override
            public void onAdFailedToLoad(@NonNull LoadAdError error) {
                Log.e(
                    TAG,
                    "Banner ad failed: code=" + error.getCode()
                        + " domain=" + error.getDomain()
                        + " message=" + error.getMessage()
                );
            }

            @Override
            public void onAdImpression() {
                Log.i(TAG, "Banner ad impression recorded");
            }
        });

        bannerAdView.loadAd(new AdRequest.Builder().build());
    }

    /** One interstitial per cold start — confirms interstitial requests work (Google test unit). */
    private void loadTestInterstitial() {
        if (interstitialRequested) {
            return;
        }
        interstitialRequested = true;

        String unitId = getString(R.string.admob_interstitial_unit_id);
        Log.i(TAG, "Loading interstitial ad request, unitId=" + unitId);

        InterstitialAd.load(
            this,
            unitId,
            new AdRequest.Builder().build(),
            new InterstitialAdLoadCallback() {
                @Override
                public void onAdLoaded(@NonNull InterstitialAd ad) {
                    interstitialAd = ad;
                    Log.i(TAG, "Interstitial ad loaded — request succeeded");
                    ad.setFullScreenContentCallback(
                        new FullScreenContentCallback() {
                            @Override
                            public void onAdDismissedFullScreenContent() {
                                interstitialAd = null;
                                Log.i(TAG, "Interstitial dismissed");
                            }

                            @Override
                            public void onAdFailedToShowFullScreenContent(@NonNull AdError error) {
                                interstitialAd = null;
                                Log.e(TAG, "Interstitial show failed: " + error.getMessage());
                            }

                            @Override
                            public void onAdShowedFullScreenContent() {
                                Log.i(TAG, "Interstitial showed");
                            }
                        }
                    );
                    if (!isFinishing()) {
                        ad.show(MainActivity.this);
                    }
                }

                @Override
                public void onAdFailedToLoad(@NonNull LoadAdError error) {
                    Log.e(
                        TAG,
                        "Interstitial ad failed: code=" + error.getCode()
                            + " message=" + error.getMessage()
                    );
                }
            }
        );
    }

    @Override
    public void onDestroy() {
        if (bannerAdView != null) {
            bannerAdView.destroy();
            bannerAdView = null;
        }
        interstitialAd = null;
        super.onDestroy();
    }
}
