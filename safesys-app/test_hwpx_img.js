import JSZip from 'jszip';
import fs from 'fs';
import path from 'path';

async function buildTestHwpx() {
    const zip = await JSZip.loadAsync(fs.readFileSync('public/전경사진 양식.hwpx'));

    // 1. Create a 1x1 pixel PNG (base64)
    const base64Png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGP6zwAAfwB/w+n28AAAAABJRU5ErkJggg==";
    const imgData = Buffer.from(base64Png, 'base64');

    // Add to BinData
    zip.file('BinData/test_img.png', imgData);

    // 2. update content.hpf
    let contentHpf = await zip.file('Contents/content.hpf').async('string');
    const imgItem = `<opf:item id="test_img" href="BinData/test_img.png" media-type="image/png" isEmbeded="1"/>`;
    contentHpf = contentHpf.replace('</opf:manifest>', `${imgItem}</opf:manifest>`);
    zip.file('Contents/content.hpf', contentHpf);

    // 3. update header.xml
    let headerXml = await zip.file('Contents/header.xml').async('string');
    const binDataList = `<hh:binDataList itemCnt="1"><hh:binItem id="test_img" format="png"/></hh:binDataList>`;
    // Usually goes after hh:refList or before hh:compatibleDocument
    if (headerXml.includes('<hh:compatibleDocument')) {
        headerXml = headerXml.replace('<hh:compatibleDocument', `${binDataList}<hh:compatibleDocument`);
    } else {
        headerXml = headerXml.replace('</hh:head>', `${binDataList}</hh:head>`);
    }
    zip.file('Contents/header.xml', headerXml);

    // 4. update section0.xml
    let sectionXml = await zip.file('Contents/section0.xml').async('string');

    // Find {{전경사진1}} and replace with <hp:pic>
    const picXml = `<hp:pic reverse="0"><hp:sz width="10000" height="10000" widthRelTo="ABSOLUTE" heightRelTo="ABSOLUTE"/><hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:imgRect x="0" y="0" cx="10000" cy="10000"/><hp:imgClip left="0" right="0" top="0" bottom="0"/><hp:shapeComment>test_img</hp:shapeComment><hc:img binaryItemIDRef="test_img" bright="0" contrast="0" effect="REAL_PIC" bitmapMode="STRETCH"/></hp:pic>`;

    sectionXml = sectionXml.replace(/<hp:t>{{전경사진1}}<\/hp:t>/g, picXml);
    zip.file('Contents/section0.xml', sectionXml);

    // 5. mimetype STORE
    const mimetypeContent = await zip.file('mimetype').async('string');
    zip.file('mimetype', mimetypeContent, { compression: 'STORE' });

    // 6. Write out
    const blob = await zip.generateAsync({
        type: 'nodebuffer',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 }
    });

    fs.writeFileSync('public/test_img.hwpx', blob);
    console.log("public/test_img.hwpx created successfully.");
}

buildTestHwpx().catch(console.error);
