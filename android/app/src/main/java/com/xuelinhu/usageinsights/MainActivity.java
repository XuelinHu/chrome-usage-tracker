package com.xuelinhu.usageinsights;

import android.app.Activity;
import android.app.AppOpsManager;
import android.app.AlertDialog;
import android.app.usage.UsageEvents;
import android.app.usage.UsageStatsManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Bundle;
import android.os.Process;
import android.provider.Settings;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.text.InputType;
import android.util.Base64;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

public final class MainActivity extends Activity {
    private static final int[] WINDOWS = {24, 24 * 7, 24 * 30};
    private static final int APP_PAGE_SIZE = 20;
    private static final int MAX_AI_RESPONSE_BYTES = 1_048_576;
    private static final String PREFS = "usage-insights";
    private static final String API_KEY_ALIAS = "usage-insights-ai-key";
    private static final int COLOR_INK = Color.rgb(28, 42, 48);
    private static final int COLOR_MUTED = Color.rgb(91, 107, 112);
    private static final int COLOR_TEAL = Color.rgb(0, 112, 102);
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final List<UsageRow> rows = new ArrayList<>();
    private int selectedHours = WINDOWS[0];
    private String aiUrl;
    private String aiModel;
    private LinearLayout appList;
    private TextView permissionStatus;
    private TextView totalView;
    private TextView aiResponse;
    private TextView range24;
    private TextView range7;
    private TextView range30;
    private TextView appPageStatus;
    private Button previousPageButton;
    private Button nextPageButton;
    private int appPage = 0;
    private EditText questionInput;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        int surfaceColor = Color.rgb(245, 248, 247);
        getWindow().setStatusBarColor(surfaceColor);
        getWindow().setNavigationBarColor(surfaceColor);
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        aiUrl = getPreferences(MODE_PRIVATE).getString("aiUrl", BuildConfig.AI_URL);
        aiModel = getPreferences(MODE_PRIVATE).getString("aiModel", BuildConfig.AI_MODEL);
        buildUi();
        refresh();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (appList != null) refresh();
    }

    private void buildUi() {
        ScrollView scroll = new ScrollView(this);
        LinearLayout page = new LinearLayout(this);
        page.setOrientation(LinearLayout.VERTICAL);
        page.setPadding(dp(20), dp(20), dp(20), dp(28));
        page.setBackgroundColor(Color.rgb(245, 248, 247));
        scroll.addView(page);

        TextView title = text("应用使用分析", 24, COLOR_INK, true);
        page.addView(title);
        TextView subtitle = text("设备统计保留在本机。AI 分析需你手动发起。", 14, COLOR_MUTED, false);
        marginTop(subtitle, 5);
        page.addView(subtitle);

        permissionStatus = text("正在检查使用情况访问权限…", 14, COLOR_MUTED, false);
        marginTop(permissionStatus, 18);
        page.addView(permissionStatus);
        Button permissionButton = button("开启使用情况访问");
        permissionButton.setOnClickListener(view -> startActivity(new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)));
        page.addView(permissionButton);

        LinearLayout ranges = new LinearLayout(this);
        ranges.setOrientation(LinearLayout.HORIZONTAL);
        range24 = rangeButton("24 小时", 24);
        range7 = rangeButton("7 天", 24 * 7);
        range30 = rangeButton("30 天", 24 * 30);
        ranges.addView(range24, new LinearLayout.LayoutParams(0, dp(42), 1));
        ranges.addView(range7, new LinearLayout.LayoutParams(0, dp(42), 1));
        ranges.addView(range30, new LinearLayout.LayoutParams(0, dp(42), 1));
        marginTop(ranges, 16);
        page.addView(ranges);

        totalView = text("前台使用总时长  --", 18, COLOR_INK, true);
        marginTop(totalView, 18);
        page.addView(totalView);
        appList = new LinearLayout(this);
        appList.setOrientation(LinearLayout.VERTICAL);
        marginTop(appList, 8);
        page.addView(appList);

        LinearLayout pagination = new LinearLayout(this);
        pagination.setGravity(Gravity.CENTER_VERTICAL | Gravity.END);
        pagination.setOrientation(LinearLayout.HORIZONTAL);
        previousPageButton = button("上一页");
        previousPageButton.setOnClickListener(view -> {
            if (appPage > 0) appPage--;
            renderRows();
        });
        nextPageButton = button("下一页");
        nextPageButton.setOnClickListener(view -> {
            if ((appPage + 1) * APP_PAGE_SIZE < rows.size()) appPage++;
            renderRows();
        });
        appPageStatus = text("", 12, COLOR_MUTED, false);
        pagination.addView(previousPageButton);
        pagination.addView(appPageStatus);
        pagination.addView(nextPageButton);
        page.addView(pagination);

        LinearLayout aiHeader = new LinearLayout(this);
        aiHeader.setGravity(Gravity.CENTER_VERTICAL);
        TextView aiTitle = text("AI 使用建议", 18, COLOR_INK, true);
        aiHeader.addView(aiTitle, new LinearLayout.LayoutParams(0, dp(44), 1));
        Button settingsButton = button("AI 连接");
        settingsButton.setOnClickListener(view -> showAiSettings());
        aiHeader.addView(settingsButton);
        marginTop(aiHeader, 24);
        page.addView(aiHeader);

        TextView privacy = text("提交给模型的内容仅包括应用名称、包名和使用分钟数，不包含网页地址或页面内容。", 13, COLOR_MUTED, false);
        page.addView(privacy);
        questionInput = new EditText(this);
        questionInput.setSingleLine(true);
        questionInput.setHint("例如：帮我总结哪些应用占用时间最多");
        marginTop(questionInput, 8);
        page.addView(questionInput);
        Button analyze = button("分析当前统计");
        analyze.setOnClickListener(view -> analyzeUsage());
        marginTop(analyze, 8);
        page.addView(analyze);
        aiResponse = text("", 15, COLOR_INK, false);
        marginTop(aiResponse, 8);
        page.addView(aiResponse);

        setContentView(scroll);
    }

    private TextView rangeButton(String label, int hours) {
        TextView view = text(label, 14, COLOR_INK, true);
        view.setGravity(Gravity.CENTER);
        view.setOnClickListener(ignored -> {
            selectedHours = hours;
            updateRangeStyles();
            refresh();
        });
        return view;
    }

    private void updateRangeStyles() {
        setRangeStyle(range24, selectedHours == 24);
        setRangeStyle(range7, selectedHours == 24 * 7);
        setRangeStyle(range30, selectedHours == 24 * 30);
    }

    private void setRangeStyle(TextView view, boolean selected) {
        view.setBackgroundColor(selected ? Color.rgb(220, 241, 237) : Color.WHITE);
        view.setTextColor(selected ? COLOR_TEAL : COLOR_MUTED);
    }

    private void refresh() {
        appPage = 0;
        if (!hasUsagePermission()) {
            permissionStatus.setText("尚未授予 Android 使用情况访问权限");
            totalView.setText("前台使用总时长  --");
            appList.removeAllViews();
            appPageStatus.setText("授权后显示");
            previousPageButton.setEnabled(false);
            nextPageButton.setEnabled(false);
            updateRangeStyles();
            return;
        }
        permissionStatus.setText("使用情况访问已开启");
        long end = System.currentTimeMillis();
        long start = end - selectedHours * 60L * 60L * 1000L;
        rows.clear();
        Map<String, Long> totals = new HashMap<>();
        UsageStatsManager manager = (UsageStatsManager) getSystemService(Context.USAGE_STATS_SERVICE);
        UsageEvents events = manager.queryEvents(start, end);
        UsageEvents.Event event = new UsageEvents.Event();
        String activePackage = null;
        long activeSince = start;
        while (events.hasNextEvent()) {
            events.getNextEvent(event);
            int type = event.getEventType();
            String packageName = event.getPackageName();
            long time = event.getTimeStamp();
            boolean resumed = type == UsageEvents.Event.ACTIVITY_RESUMED
                    || type == UsageEvents.Event.MOVE_TO_FOREGROUND;
            boolean paused = type == UsageEvents.Event.ACTIVITY_PAUSED
                    || type == UsageEvents.Event.MOVE_TO_BACKGROUND
                    || type == UsageEvents.Event.ACTIVITY_STOPPED;
            if (resumed && packageName != null) {
                if (activePackage != null && !activePackage.equals(packageName) && time >= activeSince) {
                    addUsage(totals, activePackage, time - activeSince);
                }
                if (!packageName.equals(activePackage)) {
                    activePackage = packageName;
                    activeSince = time;
                }
            } else if (paused && packageName != null && packageName.equals(activePackage)) {
                if (time >= activeSince) addUsage(totals, activePackage, time - activeSince);
                activePackage = null;
                activeSince = 0;
            }
        }
        if (activePackage != null && end >= activeSince) addUsage(totals, activePackage, end - activeSince);

        for (Map.Entry<String, Long> entry : totals.entrySet()) {
            if (entry.getValue() < 5_000 || entry.getKey().equals(getPackageName())) continue;
            try {
                ApplicationInfo info = getPackageManager().getApplicationInfo(entry.getKey(), 0);
                String label = getPackageManager().getApplicationLabel(info).toString();
                rows.add(new UsageRow(label, entry.getKey(), entry.getValue()));
            } catch (Exception ignored) {
                rows.add(new UsageRow(entry.getKey(), entry.getKey(), entry.getValue()));
            }
        }
        Collections.sort(rows, Comparator.comparingLong((UsageRow row) -> row.millis).reversed());
        long total = 0;
        for (UsageRow row : rows) total += row.millis;
        totalView.setText("前台使用总时长  " + formatDuration(total));
        renderRows();
        updateRangeStyles();
    }

    private void renderRows() {
        appList.removeAllViews();
        if (rows.isEmpty()) {
            appList.addView(text("当前时间范围内没有可显示的使用记录。", 14, COLOR_MUTED, false));
            appPageStatus.setText("0 个应用");
            previousPageButton.setEnabled(false);
            nextPageButton.setEnabled(false);
            return;
        }
        int pageCount = (rows.size() + APP_PAGE_SIZE - 1) / APP_PAGE_SIZE;
        appPage = Math.min(Math.max(appPage, 0), pageCount - 1);
        int start = appPage * APP_PAGE_SIZE;
        int end = Math.min(start + APP_PAGE_SIZE, rows.size());
        appPageStatus.setText((start + 1) + "–" + end + " / " + rows.size() + " 个应用  ·  " + (appPage + 1) + "/" + pageCount);
        previousPageButton.setEnabled(appPage > 0);
        nextPageButton.setEnabled(appPage + 1 < pageCount);
        for (int i = start; i < end; i++) {
            UsageRow row = rows.get(i);
            LinearLayout item = new LinearLayout(this);
            item.setOrientation(LinearLayout.VERTICAL);
            item.setPadding(dp(12), dp(10), dp(12), dp(10));
            item.setBackgroundColor(Color.WHITE);
            TextView appName = text(row.label, 15, COLOR_INK, true);
            TextView detail = text(row.packageName + "  ·  " + formatDuration(row.millis), 12, COLOR_MUTED, false);
            item.addView(appName);
            marginTop(detail, 3);
            item.addView(detail);
            LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
            params.bottomMargin = dp(7);
            appList.addView(item, params);
        }
    }

    private boolean hasUsagePermission() {
        AppOpsManager appOps = (AppOpsManager) getSystemService(Context.APP_OPS_SERVICE);
        return appOps.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), getPackageName())
                == AppOpsManager.MODE_ALLOWED;
    }

    private void showAiSettings() {
        LinearLayout fields = new LinearLayout(this);
        fields.setPadding(dp(20), dp(8), dp(20), 0);
        fields.setOrientation(LinearLayout.VERTICAL);
        EditText url = new EditText(this);
        url.setSingleLine(true);
        url.setHint(BuildConfig.AI_URL);
        url.setText(aiUrl);
        EditText model = new EditText(this);
        model.setSingleLine(true);
        model.setHint("模型名");
        model.setText(aiModel);
        EditText apiKey = new EditText(this);
        apiKey.setSingleLine(true);
        apiKey.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        apiKey.setHint(getPreferences(MODE_PRIVATE).contains("aiKeyCiphertext")
                ? "API Key 已保存；留空保持不变" : "可选：云端模型 API Key");
        CheckBox clearApiKey = new CheckBox(this);
        clearApiKey.setText("清除已保存的 API Key");
        fields.addView(url);
        fields.addView(model);
        fields.addView(apiKey);
        fields.addView(clearApiKey);
        new AlertDialog.Builder(this).setTitle("AI 连接设置")
                .setMessage("HTTP 仅接受私有局域网地址；HTTPS 可连接云端。配置 API Key 时必须使用 HTTPS。")
                .setView(fields)
                .setNegativeButton("取消", null)
                .setPositiveButton("保存", (dialog, which) -> {
                    String candidate = url.getText().toString().trim();
                    String candidateModel = model.getText().toString().trim();
                    String candidateKey = apiKey.getText().toString().trim();
                    boolean keyHasLineBreak = candidateKey.contains("\n") || candidateKey.contains("\r");
                    boolean retainsKey = getPreferences(MODE_PRIVATE).contains("aiKeyCiphertext")
                            && !clearApiKey.isChecked();
                    boolean sendsKeyOverHttp = (!candidateKey.isEmpty() || retainsKey)
                            && "http".equals(Uri.parse(candidate).getScheme());
                    if (!isAllowedAiUrl(candidate) || candidateModel.isEmpty()
                            || candidateKey.length() > 512 || keyHasLineBreak || sendsKeyOverHttp) {
                        Toast.makeText(this, "配置无效，请检查地址、模型名和 API Key 规则", Toast.LENGTH_LONG).show();
                        return;
                    }
                    try {
                        saveAiApiKey(candidateKey, clearApiKey.isChecked());
                    } catch (Exception error) {
                        Toast.makeText(this, "API Key 安全存储失败", Toast.LENGTH_LONG).show();
                        return;
                    }
                    aiUrl = candidate;
                    aiModel = candidateModel;
                    getPreferences(MODE_PRIVATE).edit().putString("aiUrl", aiUrl)
                            .putString("aiModel", aiModel).apply();
        }).show();
    }

    private String readAiApiKey() throws Exception {
        android.content.SharedPreferences preferences = getPreferences(MODE_PRIVATE);
        String encodedIv = preferences.getString("aiKeyIv", null);
        String encodedCiphertext = preferences.getString("aiKeyCiphertext", null);
        if (encodedIv == null || encodedCiphertext == null) return "";

        KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
        keyStore.load(null);
        SecretKey key = (SecretKey) keyStore.getKey(API_KEY_ALIAS, null);
        if (key == null) throw new IllegalStateException("API Key encryption key is unavailable");

        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key,
                new GCMParameterSpec(128, Base64.decode(encodedIv, Base64.NO_WRAP)));
        byte[] plaintext = cipher.doFinal(Base64.decode(encodedCiphertext, Base64.NO_WRAP));
        return new String(plaintext, StandardCharsets.UTF_8);
    }

    private void saveAiApiKey(String value, boolean clear) throws Exception {
        android.content.SharedPreferences preferences = getPreferences(MODE_PRIVATE);
        KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
        keyStore.load(null);

        if (clear) {
            preferences.edit().remove("aiKeyIv").remove("aiKeyCiphertext").apply();
            if (keyStore.containsAlias(API_KEY_ALIAS)) keyStore.deleteEntry(API_KEY_ALIAS);
            return;
        }
        if (value.isEmpty()) return;

        SecretKey key;
        if (keyStore.containsAlias(API_KEY_ALIAS)) {
            key = (SecretKey) keyStore.getKey(API_KEY_ALIAS, null);
        } else {
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder(API_KEY_ALIAS,
                    KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setRandomizedEncryptionRequired(true)
                    .build());
            key = generator.generateKey();
        }

        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key);
        byte[] ciphertext = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
        preferences.edit()
                .putString("aiKeyIv", Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP))
                .putString("aiKeyCiphertext", Base64.encodeToString(ciphertext, Base64.NO_WRAP))
                .apply();
    }

    private boolean isAllowedAiUrl(String value) {
        Uri uri = Uri.parse(value);
        String host = uri.getHost();
        if (host == null || uri.getUserInfo() != null || uri.getPort() < 1 || uri.getPort() > 65535) return false;
        if (!"http".equals(uri.getScheme()) && !"https".equals(uri.getScheme())) return false;
        if ("https".equals(uri.getScheme())) return uri.getPath() != null
                && uri.getPath().endsWith("/v1/chat/completions");
        String[] octets = host.split("\\.");
        if (octets.length != 4) return false;
        try {
            int first = Integer.parseInt(octets[0]);
            int second = Integer.parseInt(octets[1]);
            int third = Integer.parseInt(octets[2]);
            int fourth = Integer.parseInt(octets[3]);
            return first <= 255 && second <= 255 && third <= 255 && fourth <= 255
                    && (first == 10 || first == 192 && second == 168
                    || first == 172 && second >= 16 && second <= 31)
                    && uri.getPath() != null && uri.getPath().endsWith("/v1/chat/completions");
        } catch (NumberFormatException error) {
            return false;
        }
    }

    private void analyzeUsage() {
        if (rows.isEmpty()) {
            aiResponse.setText("先授予使用情况访问权限并刷新统计。");
            return;
        }
        aiResponse.setText("正在连接 AI 服务…");
        final String question = questionInput.getText().toString().trim();
        final int periodHours = selectedHours;
        final String endpoint = aiUrl;
        final String modelName = aiModel;
        final JSONArray usage = new JSONArray();
        for (int i = 0; i < Math.min(rows.size(), 20); i++) {
            UsageRow row = rows.get(i);
            JSONObject item = new JSONObject();
            try {
                item.put("app", row.label);
                item.put("package", row.packageName);
                item.put("minutes", Math.round(row.millis / 60_000.0));
                usage.put(item);
            } catch (Exception ignored) { }
        }
        executor.execute(() -> {
            HttpURLConnection connection = null;
            try {
                String apiKey = readAiApiKey();
                if (!apiKey.isEmpty() && "http".equals(Uri.parse(endpoint).getScheme())) {
                    throw new IllegalStateException("配置 API Key 后必须使用 HTTPS");
                }
                connection = (HttpURLConnection) new URL(endpoint).openConnection();
                connection.setInstanceFollowRedirects(false);
                connection.setConnectTimeout(5000);
                connection.setReadTimeout(30000);
                connection.setRequestMethod("POST");
                connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                if (!apiKey.isEmpty()) connection.setRequestProperty("Authorization", "Bearer " + apiKey);
                connection.setDoOutput(true);
                JSONObject body = new JSONObject();
                body.put("model", modelName);
                body.put("stream", false);
                JSONArray messages = new JSONArray();
                messages.put(new JSONObject().put("role", "system").put("content",
                        "你是数字健康助手。只根据给定的应用名称和前台分钟数总结使用分布，避免臆测网页内容、用户身份或健康诊断，给出简短可执行建议。"));
                String prompt = "统计窗口为最近 " + periodHours + " 小时。数据：" + usage;
                if (!question.isEmpty()) prompt += "\n用户问题：" + question;
                messages.put(new JSONObject().put("role", "user").put("content", prompt));
                body.put("messages", messages);
                byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
                try (OutputStream output = connection.getOutputStream()) { output.write(bytes); }
                int status = connection.getResponseCode();
                InputStream stream = status >= 200 && status < 300
                        ? connection.getInputStream() : connection.getErrorStream();
                StringBuilder response = new StringBuilder();
                try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
                    String line;
                    while ((line = reader.readLine()) != null) {
                        if (response.length() + line.length() > MAX_AI_RESPONSE_BYTES) {
                            throw new IllegalStateException("AI 响应超过 1 MiB 限制");
                        }
                        response.append(line);
                    }
                }
                if (status < 200 || status >= 300) throw new IllegalStateException("HTTP " + status);
                String answer = new JSONObject(response.toString()).getJSONArray("choices")
                        .getJSONObject(0).getJSONObject("message").getString("content");
                runOnUiThread(() -> aiResponse.setText(answer));
            } catch (Exception error) {
                runOnUiThread(() -> aiResponse.setText("AI 请求失败：" + error.getMessage()));
            } finally {
                if (connection != null) connection.disconnect();
            }
        });
    }

    private void addUsage(Map<String, Long> totals, String packageName, long millis) {
        if (millis > 0) totals.put(packageName, totals.getOrDefault(packageName, 0L) + millis);
    }

    private TextView text(String value, int size, int color, boolean bold) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(size);
        view.setTextColor(color);
        if (bold) view.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        return view;
    }

    private Button button(String label) {
        Button button = new Button(this);
        button.setText(label);
        button.setTextColor(COLOR_TEAL);
        return button;
    }

    private void marginTop(View view, int value) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        params.topMargin = dp(value);
        view.setLayoutParams(params);
    }

    private String formatDuration(long millis) {
        long minutes = millis / 60_000;
        long hours = minutes / 60;
        long remainder = minutes % 60;
        return hours > 0 ? hours + " 小时 " + remainder + " 分" : remainder + " 分";
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    @Override
    protected void onDestroy() {
        executor.shutdownNow();
        super.onDestroy();
    }

    private static final class UsageRow {
        final String label;
        final String packageName;
        final long millis;
        UsageRow(String label, String packageName, long millis) {
            this.label = label;
            this.packageName = packageName;
            this.millis = millis;
        }
    }
}
