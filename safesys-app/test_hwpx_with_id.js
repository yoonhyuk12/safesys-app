import JSZip from 'jszip';
import fs from 'fs';

async function buildTestHwpx3() {
    const zip = await JSZip.loadAsync(fs.readFileSync('public/전경사진 양식.hwpx'));
    const base64Png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGP6zwAAfwB/w+n28AAAAABJRU5ErkJggg==";
    zip.file('BinData/test_img.png', Buffer.from(base64Png, 'base64'));

    let contentHpf = await zip.file('Contents/content.hpf').async('string');
    contentHpf = contentHpf.replace('</opf:manifest>', `<opf:item id="test_img" href="BinData/test_img.png" media-type="image/png" isEmbeded="1"/></opf:manifest>`);
    zip.file('Contents/content.hpf', contentHpf);

    let sectionXml = await zip.file('Contents/section0.xml').async('string');
    const picXml = `<hp:pic id="2000000000" instid="1000000000" reverse="0"><hp:sz width="10000" height="10000" widthRelTo="ABSOLUTE" heightRelTo="ABSOLUTE"/><hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:imgRect x="0" y="0" cx="10000" cy="10000"/><hp:imgClip left="0" right="0" top="0" bottom="0"/><hp:shapeComment>test_img</hp:shapeComment><hc:img binaryItemIDRef="test_img" bright="0" contrast="0" effect="REAL_PIC" alpha="0"/></hp:pic>`;
    sectionXml = sectionXml.replace(/<hp:t>{{전경사진1}}<\/hp:t>/g, picXml);
    zip.file('Contents/section0.xml', sectionXml);

    const mimetypeContent = await zip.file('mimetype').async('string');
    zip.file('mimetype', mimetypeContent, { compression: 'STORE' });

    const blob = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    fs.writeFileSync('public/test_with_id.hwpx', blob);
    console.log("public/test_with_id.hwpx created successfully.");
}
buildTestHwpx3().catch(console.error);
