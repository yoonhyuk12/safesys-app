import fs from 'fs';
import JSZip from 'jszip';

async function readRows() {
    const z = await JSZip.loadAsync(fs.readFileSync('public/지적사항 사진.hwpx'));
    const s = await z.file('Contents/section0.xml').async('string');
    const m = s.match(/<hp:tr>[\s\S]*?<\/hp:tr>/g);
    let out = '';
    m.forEach((row, i) => {
        const texts = row.match(/<hp:t>.*?<\/hp:t>/g) || [];
        out += `\nRow ${i}:\n` + texts.join(' ') + '\n';
    });
    fs.writeFileSync('rows_out.txt', out);
}
readRows().catch(console.error);
