const JSZip = require('jszip');
const fs = require('fs');

fs.readFile('public/안전점검 양식.hwpx', (err, data) => {
    if (err) throw err;
    JSZip.loadAsync(data).then(zip => {
        const files = Object.keys(zip.files).filter(k => k.toLowerCase().includes('bindata'));
        console.log("안전점검 양식 BinData:", files.length > 0 ? files : "No BinData folder");
    });
});

fs.readFile('public/전경사진 양식.hwpx', (err, data) => {
    if (err) throw err;
    JSZip.loadAsync(data).then(zip => {
        const files = Object.keys(zip.files).filter(k => k.toLowerCase().includes('bindata'));
        console.log("전경사진 양식 BinData:", files.length > 0 ? files : "No BinData folder");

        // Also log content.hpf text to see what it uses
        zip.file("Contents/content.hpf").async("string").then(content => {
            console.log("content.hpf contains BinData?", content.includes("BinData"));
        });

        zip.file("META-INF/manifest.xml").async("string").then(manifest => {
            console.log("manifest.xml contains BinData?", manifest.includes("BinData"));
        });
    });
});
