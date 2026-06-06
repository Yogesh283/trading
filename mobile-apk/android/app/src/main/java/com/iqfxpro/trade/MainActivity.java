package com.iqfxpro.trade;

import android.os.Bundle;
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
import com.google.android.gms.ads.rewarded.RewardedAd;
import com.google.android.gms.ads.rewarded.RewardedAdLoadCallback;

/**
 * Capacitor shell + Google Mobile Ads (interstitial + rewarded).
 * Ad unit IDs live in res/values/strings.xml.
 */
public class MainActivity extends BridgeActivity {

    private static final String TAG = "IqfxAdMob";

    private InterstitialAd interstitialAd;
    private RewardedAd rewardedAd;
    private boolean interstitialLoadRequested;
    private boolean rewardedLoadRequested;
    private boolean interstitialShownThisSession;
    private boolean rewardedShownThisSession;

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
                loadInterstitial();
                loadRewardedAd();
            });
        });
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
                    Log.i(TAG, "Interstitial ad loaded");
                    ad.setFullScreenContentCallback(
                        new FullScreenContentCallback() {
                            @Override
                            public void onAdDismissedFullScreenContent() {
                                interstitialAd = null;
                                Log.i(TAG, "Interstitial dismissed");
                                showRewardedIfReady();
                            }

                            @Override
                            public void onAdFailedToShowFullScreenContent(@NonNull AdError error) {
                                interstitialAd = null;
                                Log.e(TAG, "Interstitial show failed: " + error.getMessage());
                                showRewardedIfReady();
                            }

                            @Override
                            public void onAdShowedFullScreenContent() {
                                Log.i(TAG, "Interstitial showed");
                            }
                        }
                    );
                    showInterstitialIfReady();
                }

                @Override
                public void onAdFailedToLoad(@NonNull LoadAdError error) {
                    interstitialLoadRequested = false;
                    Log.e(
                        TAG,
                        "Interstitial ad failed: code=" + error.getCode()
                            + " message=" + error.getMessage()
                    );
                    showRewardedIfReady();
                }
            }
        );
    }

    private void showInterstitialIfReady() {
        if (interstitialAd == null || isFinishing() || interstitialShownThisSession) {
            return;
        }
        interstitialShownThisSession = true;
        interstitialAd.show(this);
    }

    private void loadRewardedAd() {
        if (rewardedLoadRequested) {
            return;
        }
        rewardedLoadRequested = true;

        final String unitId = getString(R.string.admob_rewarded_unit_id);
        Log.i(TAG, "Loading rewarded ad, unitId=" + unitId);

        RewardedAd.load(
            this,
            unitId,
            new AdRequest.Builder().build(),
            new RewardedAdLoadCallback() {
                @Override
                public void onAdLoaded(@NonNull RewardedAd ad) {
                    rewardedAd = ad;
                    Log.i(TAG, "Rewarded ad loaded");
                    ad.setFullScreenContentCallback(
                        new FullScreenContentCallback() {
                            @Override
                            public void onAdDismissedFullScreenContent() {
                                rewardedAd = null;
                                rewardedLoadRequested = false;
                                Log.i(TAG, "Rewarded ad dismissed");
                                loadRewardedAd();
                            }

                            @Override
                            public void onAdFailedToShowFullScreenContent(@NonNull AdError error) {
                                rewardedAd = null;
                                rewardedLoadRequested = false;
                                Log.e(TAG, "Rewarded show failed: " + error.getMessage());
                                loadRewardedAd();
                            }

                            @Override
                            public void onAdShowedFullScreenContent() {
                                Log.i(TAG, "Rewarded ad showed");
                            }
                        }
                    );
                }

                @Override
                public void onAdFailedToLoad(@NonNull LoadAdError error) {
                    rewardedLoadRequested = false;
                    Log.e(
                        TAG,
                        "Rewarded ad failed: code=" + error.getCode()
                            + " message=" + error.getMessage()
                    );
                }
            }
        );
    }

    private void showRewardedIfReady() {
        if (rewardedShownThisSession || rewardedAd == null || isFinishing()) {
            return;
        }
        rewardedShownThisSession = true;
        rewardedAd.show(
            this,
            rewardItem ->
                Log.i(
                    TAG,
                    "User earned reward: "
                        + rewardItem.getAmount()
                        + " "
                        + rewardItem.getType()
                )
        );
    }

    @Override
    public void onDestroy() {
        interstitialAd = null;
        rewardedAd = null;
        super.onDestroy();
    }
}
