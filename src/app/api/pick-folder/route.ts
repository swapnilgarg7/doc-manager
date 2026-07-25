import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

export const runtime = "nodejs";
// The native dialog blocks until the user picks or cancels — give them time.
export const maxDuration = 300;

const run = promisify(execFile);

/**
 * POST /api/pick-folder
 * Opens the operating system's native "choose folder" dialog on THIS machine
 * (the app runs locally) and returns the absolute path the user picked. This is
 * the easy path — no typing or pasting, and the OS hands us a clean path.
 *
 * Returns { path } on success, { canceled: true } if dismissed, or 501 with
 * { unsupported: true } on platforms without a supported dialog (UI falls back
 * to manual entry).
 */
export async function POST() {
  const platform = process.platform;
  try {
    let picked: string | null = null;

    if (platform === "darwin") {
      picked = await pickMac();
    } else if (platform === "win32") {
      picked = await pickWindows();
    } else if (platform === "linux") {
      picked = await pickLinux();
    } else {
      return NextResponse.json(
        { error: "Native folder picker isn't supported here.", unsupported: true },
        { status: 501 }
      );
    }

    if (picked === null) return NextResponse.json({ canceled: true });
    return NextResponse.json({ path: picked });
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    // The picker binary (osascript/powershell/zenity) is missing.
    if (e.code === "ENOENT") {
      return NextResponse.json(
        {
          error: "No native folder dialog is available. Type the path instead.",
          unsupported: true,
        },
        { status: 501 }
      );
    }
    return NextResponse.json(
      { error: e.message || "Folder picker failed." },
      { status: 500 }
    );
  }
}

async function pickMac(): Promise<string | null> {
  try {
    const { stdout } = await run("osascript", [
      "-e",
      'POSIX path of (choose folder with prompt "Choose the folder to scan")',
    ]);
    const p = stdout.trim();
    return p || null;
  } catch (err) {
    // User pressed Cancel → osascript exits non-zero with "User canceled".
    if (/User canceled|-128/.test((err as Error).message)) return null;
    throw err;
  }
}

async function pickWindows(): Promise<string | null> {
  const script =
    "Add-Type -AssemblyName System.Windows.Forms; " +
    "$d = New-Object System.Windows.Forms.FolderBrowserDialog; " +
    "$d.Description = 'Choose the folder to scan'; " +
    "if ($d.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($d.SelectedPath) }";
  const { stdout } = await run("powershell", [
    "-NoProfile",
    "-STA",
    "-Command",
    script,
  ]);
  const p = stdout.trim();
  return p || null;
}

async function pickLinux(): Promise<string | null> {
  try {
    const { stdout } = await run("zenity", [
      "--file-selection",
      "--directory",
      "--title=Choose the folder to scan",
    ]);
    const p = stdout.trim();
    return p || null;
  } catch (err) {
    // zenity exits 1 when the user cancels.
    if ((err as { code?: number }).code === 1) return null;
    throw err;
  }
}
