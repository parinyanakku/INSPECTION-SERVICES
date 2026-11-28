package com.teaminspectionproelite.inspection;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.widget.TextView;

public final class Launcher extends Activity {
    private static final String SITE = "https://teaminspectionproelite.github.io/INSPECTION-SERVICES/";

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        // A browser Custom Tab shares the browser's account and permission flows.
        Intent browser = new Intent(Intent.ACTION_VIEW, Uri.parse(SITE));
        Bundle options = new Bundle();
        options.putBinder("android.support.customtabs.extra.SESSION", null);
        browser.putExtras(options);
        try {
            startActivity(browser);
            finish();
        } catch (ActivityNotFoundException missingBrowser) {
            TextView message = new TextView(this);
            message.setText("Open ProElite Inspection in a browser:\n" + SITE);
            message.setTextIsSelectable(true);
            setContentView(message);
        }
    }
}
