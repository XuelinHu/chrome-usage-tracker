plugins {
    id("com.android.application")
}

android {
    namespace = "com.xuelinhu.usageinsights"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.xuelinhu.usageinsights"
        minSdk = 29
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"
        buildConfigField("String", "AI_URL", "\"http://192.168.1.9:11434/v1/chat/completions\"")
        buildConfigField("String", "AI_MODEL", "\"qwen3:14b\"")
    }

    buildFeatures { buildConfig = true }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildTypes {
        release {
            signingConfig = signingConfigs.getByName("debug")
            isMinifyEnabled = false
        }
    }
}
