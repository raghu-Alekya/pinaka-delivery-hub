const fs = require('fs');
const { execSync } = require('child_process');

const mdPath = 'C:/Projects/pinaka-delivery-hub/docs/pdh-master-architecture-spec.md';
const htmlPath = 'C:/Projects/pinaka-delivery-hub/docs/pdh-master-architecture-spec.html';
const pdfPath = 'C:/Projects/pinaka-delivery-hub/docs/pdh-master-architecture-spec.pdf';

const mdContent = fs.readFileSync(mdPath, 'utf8');

// Basic Markdown to HTML Transformer
function mdToHtml(markdown) {
  let html = markdown
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^#### (.*$)/gim, '<h4>$1</h4>')
    .replace(/\*\*(.* proposed|.*)\*\*/gim, '<strong>$1</strong>')
    .replace(/```(.*?)\n([\s\S]*?)```/gim, '<pre><code>$2</code></pre>')
    .replace(/\n\n/g, '<br/><br/>');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>PDH Master Architecture Specification</title>
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 40px; color: #1e293b; line-height: 1.6; }
    h1 { color: #0f172a; border-bottom: 2px solid #3b82f6; padding-bottom: 8px; }
    h2 { color: #1e293b; border-bottom: 1px solid #cbd5e1; padding-bottom: 5px; margin-top: 30px; }
    h3 { color: #334155; margin-top: 20px; }
    pre { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 15px; overflow-x: auto; font-family: 'Consolas', monospace; font-size: 13px; }
    code { font-family: 'Consolas', monospace; background: #f1f5f9; padding: 2px 5px; border-radius: 4px; }
    table { border-collapse: collapse; width: 100%; margin: 20px 0; }
    th, td { border: 1px solid #cbd5e1; padding: 10px; text-align: left; font-size: 14px; }
    th { background: #f1f5f9; font-weight: 600; color: #0f172a; }
    tr:nth-child(even) { background: #f8fafc; }
  </style>
</head>
<body>
  ${html}
</body>
</html>`;
}

fs.writeFileSync(htmlPath, mdToHtml(mdContent));
console.log('✅ HTML generated successfully:', htmlPath);

// Try rendering to PDF via Edge or Chrome headless
try {
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  if (fs.existsSync(edgePath)) {
    execSync(`"${edgePath}" --headless --print-to-pdf="${pdfPath}" "${htmlPath}"`);
    console.log('🎉 PDF generated successfully using Microsoft Edge:', pdfPath);
  } else {
    console.log('Edge path not found, HTML is ready at:', htmlPath);
  }
} catch (err) {
  console.log('PDF generation note:', err.message);
}
