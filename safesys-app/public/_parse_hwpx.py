import zipfile, sys, re, os
sys.stdout.reconfigure(encoding='utf-8')

hwpx_path = os.path.join(os.path.dirname(__file__), '안전점검 양식.hwpx')
z = zipfile.ZipFile(hwpx_path, 'r')
content = z.read('Contents/section0.xml').decode('utf-8')

sec_start_tag = content.find('<hs:sec')
sec_start = content.find('>', sec_start_tag) + 1
sec_end = content.rfind('</hs:sec>')
sc = content[sec_start:sec_end]

depth = 0
paras = []
cs = 0
i = 0
while i < len(sc):
    if sc[i:i+5] == '<hp:p':
        if depth == 0:
            cs = i
        depth += 1
    elif sc[i:i+7] == '</hp:p>':
        depth -= 1
        if depth == 0:
            pe = i + 7
            pt = sc[cs:pe]
            texts = re.findall(r'<hp:t>([^<]+)</hp:t>', pt)
            tbl_ids = re.findall(r'hp:tbl id="(\d+)"', pt)
            pb = re.search(r'pageBreak="(\d+)"', pt[:200])
            pv = pb.group(1) if pb else '?'
            kt = [t.strip() for t in texts if len(t.strip()) > 1][:5]
            paras.append((len(paras), pv, tbl_ids, pe - cs, kt))
    i += 1

for idx, pv, tbl_ids, length, kt in paras:
    print(f'Para {idx:2d}: pb={pv} tables={tbl_ids} len={length:6d} texts={kt}')
z.close()
