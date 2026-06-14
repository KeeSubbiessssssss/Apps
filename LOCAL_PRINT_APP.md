# Local Label Print Station

This local app serves the existing label UI and sends print jobs through macOS `lp`, so the app can print without opening the browser print dialog.

## Start

Double-click `Start Label Print Station.command`, or run:

```bash
cd /Users/keesubpike/Documents/GitHub/Apps
python3 local-print-app.py
```

Then open:

```text
http://127.0.0.1:8765/awc/
```

## Print Settings

When the app is opened through the local server, a `Settings` button appears. It can save:

- Printer
- Preset name
- Media size
- Orientation
- Fit to page
- Advanced `lp` options

The public GitHub Pages version still uses the normal browser print dialog because websites cannot bypass it.
