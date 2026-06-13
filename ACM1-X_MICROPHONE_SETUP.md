# A1 Evo AcoustiX — ACM1-X Microphone Support

If you own an ACM1-X calibrated microphone, A1 Evo AcoustiX can use its custom calibration profile for improved measurement accuracy.

## How to Set Up

### 1. Locate your `.acm` calibration file

If you have used the MultEQ-X app on Windows, the file is saved automatically at:

```
C:\Users\<YourUserName>\AppData\Local\Packages\AudysseyLaboratoriesInc.MultEQ-X_y7bzapk3v9hbw\LocalState\
```

The file will be named something like:
```
Audyssey Mic  154015.acm
```

> **Note:** The AppData folder is hidden by default. Type the path directly into File Explorer's address bar to access it.

### 2. Copy the `.acm` file into the app folder

Place the `.acm` file in the same folder where the A1 Evo AcoustiX application (`.exe`) is located.

### 3. Start A1 Evo AcoustiX

The app will automatically detect and load the `.acm` file. You will see confirmation in the log:

```
[CALIBRATION] Applying extended mic correction  SN: XXXXXX | Sensitivity: ...
```

If no `.acm` file is found, the app uses the built-in standard Audyssey microphone calibration as before.

## Important Notes

- **Only one `.acm` file** should be placed in the app folder. If multiple are found, only the first one is used.

- **Do not rename or modify** the `.acm` file — it must be the original file from MultEQ-X.

- **Cirrus Logic DSP models** (e.g. Denon X1700H, X2800H): These receivers apply standard calibration internally during measurement. When an ACM1-X mic is detected, the app automatically applies a differential correction to account for this.

- **All other models**: The full ACM1-X calibration replaces the built-in standard calibration entirely.

- **Switching back to a standard microphone**: Simply remove the `.acm` file from the app folder.

- **No re-measurement needed**: If your older measurements were taken using the ACM1-X mic, there is no need to re-measure after adding the `.acm` file.
