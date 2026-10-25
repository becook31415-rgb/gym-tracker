// Exporter interface: every way of getting export files off the phone implements
//   export(files: Array<{name, type, text}>) -> Promise<'shared' | 'downloaded' | 'cancelled'>
// A future "upload to OneDrive via Microsoft Graph" exporter would be another class here.
//
// iOS needs navigator.share() to be called directly from the tap, so callers must build
// the files synchronously (from data already in memory) and call export() straight away.

class ShareExporter {
  constructor(fileObjs) { this.fileObjs = fileObjs; }
  async export() {
    try {
      // No title/text: iOS "Save to Files" would save it as an extra .txt file.
      await navigator.share({ files: this.fileObjs });
      return 'shared';
    } catch (e) {
      if (e && e.name === 'AbortError') return 'cancelled';
      throw e;
    }
  }
}

class DownloadExporter {
  async export(files) {
    for (const f of files) {
      const url = URL.createObjectURL(new Blob([f.text], { type: f.type }));
      const a = document.createElement('a');
      a.href = url;
      a.download = f.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      await new Promise((r) => setTimeout(r, 300));
    }
    return 'downloaded';
  }
}

export function exportFiles(files) {
  const fileObjs = files.map((f) => new File([f.text], f.name, { type: f.type }));
  if (navigator.canShare && navigator.canShare({ files: fileObjs })) {
    return new ShareExporter(fileObjs).export(files);
  }
  return new DownloadExporter().export(files);
}
