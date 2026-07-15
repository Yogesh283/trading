# Keep line numbers for Play Console crash deobfuscation
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# Capacitor / Cordova / WebView shell
-keep class com.getcapacitor.** { *; }
-keep class org.apache.cordova.** { *; }
-keep class com.iqfxpro.trade.** { *; }

# Google Mobile Ads
-keep class com.google.android.gms.ads.** { *; }
-keep class com.google.android.gms.common.** { *; }
-dontwarn com.google.android.gms.**

# AndroidX
-keep class androidx.** { *; }
-dontwarn androidx.**
