param(
  [Parameter(Mandatory = $true)]
  [string]$JsonPath,

  [Parameter(Mandatory = $true)]
  [string]$OutputPath,

  [Parameter(Mandatory = $false)]
  [string]$TemplatePath = ''
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $JsonPath)) {
  throw "JSON file not found: $JsonPath"
}

$defaultTemplatePath = Join-Path (Split-Path -Parent $PSScriptRoot) 'public\안전점검 양식.hwp'
if ([string]::IsNullOrWhiteSpace($TemplatePath)) {
  $TemplatePath = $defaultTemplatePath
}
if (-not (Test-Path -LiteralPath $TemplatePath)) {
  throw "Template file not found: $TemplatePath"
}

$payload = Get-Content -LiteralPath $JsonPath -Raw -Encoding UTF8 | ConvertFrom-Json
$outputDir = [IO.Path]::GetDirectoryName($OutputPath)
if (-not [string]::IsNullOrWhiteSpace($outputDir)) {
  New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
}
Copy-Item -LiteralPath $TemplatePath -Destination $OutputPath -Force

$workDir = Join-Path ([IO.Path]::GetDirectoryName($OutputPath)) '_images'
New-Item -ItemType Directory -Path $workDir -Force | Out-Null

function To-Text {
  param([Parameter(ValueFromPipeline = $true)] $Value)
  if ($null -eq $Value) { return '' }
  if ($Value -is [string]) { return $Value.Trim() }
  return [string]$Value
}

function To-DateText {
  param([Parameter(ValueFromPipeline = $true)] $Value)
  $s = To-Text $Value
  if ([string]::IsNullOrWhiteSpace($s)) { return '' }
  try {
    $dt = [DateTime]::Parse($s)
    return $dt.ToString('yyyy. MM. dd.')
  } catch {
    return $s
  }
}

function To-KoreanDateText {
  param([Parameter(ValueFromPipeline = $true)] $Value)
  $s = To-Text $Value
  if ([string]::IsNullOrWhiteSpace($s)) { return '' }
  try {
    $dt = [DateTime]::Parse($s)
    return $dt.ToString('yyyy년 MM월 dd일')
  } catch {
    return $s
  }
}

function To-BudgetText {
  param([Parameter(ValueFromPipeline = $true)] $Value)
  if ($null -eq $Value) { return '' }
  try {
    return ('{0:N0}' -f [decimal]$Value)
  } catch {
    return To-Text $Value
  }
}

function Hwp-InsertText {
  param(
    [Parameter(Mandatory = $true)] $HwpObj,
    [string]$Text = ''
  )
  $HwpObj.HAction.GetDefault('InsertText', $HwpObj.HParameterSet.HInsertText.HSet)
  $HwpObj.HParameterSet.HInsertText.Text = $Text
  $HwpObj.HAction.Execute('InsertText', $HwpObj.HParameterSet.HInsertText.HSet) | Out-Null
}

function Hwp-Paragraph {
  param(
    [Parameter(Mandatory = $true)] $HwpObj,
    [string]$Text = ''
  )
  Hwp-InsertText -HwpObj $HwpObj -Text ($Text + "`r`n")
}

function Hwp-ApplyFont {
  param(
    [Parameter(Mandatory = $true)] $HwpObj,
    [Parameter(Mandatory = $true)] [string]$FontName
  )
  $HwpObj.HAction.GetDefault('CharShape', $HwpObj.HParameterSet.HCharShape.HSet)
  $char = $HwpObj.HParameterSet.HCharShape
  $char.FaceNameHangul = $FontName
  $char.FaceNameLatin = $FontName
  $char.FaceNameHanja = $FontName
  $char.FaceNameJapanese = $FontName
  $char.FaceNameOther = $FontName
  $char.FaceNameSymbol = $FontName
  $char.FaceNameUser = $FontName
  $char.Height = 1000
  $HwpObj.HAction.Execute('CharShape', $char.HSet) | Out-Null
}

function Hwp-ReplaceAllText {
  param(
    [Parameter(Mandatory = $true)] $HwpObj,
    [Parameter(Mandatory = $true)] [string]$FindText,
    [Parameter(Mandatory = $true)] [string]$ReplaceText
  )

  if ([string]::IsNullOrWhiteSpace($FindText)) { return }
  $HwpObj.HAction.GetDefault('AllReplace', $HwpObj.HParameterSet.HFindReplace.HSet)
  $set = $HwpObj.HParameterSet.HFindReplace
  $set.FindString = $FindText
  $set.ReplaceString = $ReplaceText
  $set.IgnoreMessage = 1
  $set.FindType = 1
  $HwpObj.HAction.Execute('AllReplace', $set.HSet) | Out-Null
}

function Hwp-FindText {
  param(
    [Parameter(Mandatory = $true)] $HwpObj,
    [Parameter(Mandatory = $true)] [string]$FindText,
    [switch]$FromCurrent
  )

  if ([string]::IsNullOrWhiteSpace($FindText)) { return $false }
  if (-not $FromCurrent) {
    try { $HwpObj.HAction.Run('MoveDocBegin') | Out-Null } catch {}
  }

  $HwpObj.HAction.GetDefault('RepeatFind', $HwpObj.HParameterSet.HFindReplace.HSet)
  $set = $HwpObj.HParameterSet.HFindReplace
  $set.FindString = $FindText
  $set.IgnoreMessage = 1
  $set.FindType = 1
  return [bool]($HwpObj.HAction.Execute('RepeatFind', $set.HSet))
}

function Hwp-SetTableCellBelowLabel {
  param(
    [Parameter(Mandatory = $true)] $HwpObj,
    [Parameter(Mandatory = $true)] [string]$Label,
    [string]$Value,
    [int]$Occurrence = 1,
    [int]$Down = 1,
    [int]$Right = 0
  )

  $text = To-Text $Value
  if ([string]::IsNullOrWhiteSpace($text)) { return $false }
  if ($Occurrence -lt 1) { $Occurrence = 1 }

  $found = $false
  for ($i = 1; $i -le $Occurrence; $i++) {
    $found = Hwp-FindText -HwpObj $HwpObj -FindText $Label -FromCurrent:($i -gt 1)
    if (-not $found) { return $false }
  }

  for ($i = 0; $i -lt [Math]::Max(0, $Down); $i++) {
    try { $HwpObj.HAction.Run('TableLowerCell') | Out-Null } catch {}
  }
  for ($i = 0; $i -lt [Math]::Max(0, $Right); $i++) {
    try { $HwpObj.HAction.Run('TableRightCell') | Out-Null } catch {}
  }

  # 기존 샘플 텍스트를 지우고 셀 값을 기록한다.
  try { $HwpObj.HAction.Run('SelectAll') | Out-Null } catch {}
  try { $HwpObj.HAction.Run('Delete') | Out-Null } catch {}
  Hwp-InsertText -HwpObj $HwpObj -Text $text
  return $true
}

function Hwp-MoveToSectionAndLabel {
  param(
    [Parameter(Mandatory = $true)] $HwpObj,
    [Parameter(Mandatory = $true)] [string]$SectionTitle,
    [Parameter(Mandatory = $true)] [string]$Label,
    [int]$LabelOccurrence = 1
  )

  if ([string]::IsNullOrWhiteSpace($SectionTitle) -or [string]::IsNullOrWhiteSpace($Label)) {
    return $false
  }
  if ($LabelOccurrence -lt 1) { $LabelOccurrence = 1 }

  $foundSection = Hwp-FindText -HwpObj $HwpObj -FindText $SectionTitle
  if (-not $foundSection) { return $false }

  $foundLabel = $false
  for ($i = 1; $i -le $LabelOccurrence; $i++) {
    $foundLabel = Hwp-FindText -HwpObj $HwpObj -FindText $Label -FromCurrent
    if (-not $foundLabel) { return $false }
  }

  return $true
}

function Hwp-SetTableCellBelowLabelInSection {
  param(
    [Parameter(Mandatory = $true)] $HwpObj,
    [Parameter(Mandatory = $true)] [string]$SectionTitle,
    [Parameter(Mandatory = $true)] [string]$Label,
    [string]$Value,
    [int]$LabelOccurrence = 1,
    [int]$Down = 1,
    [int]$Right = 0
  )

  $text = To-Text $Value
  if ([string]::IsNullOrWhiteSpace($text)) { return $false }

  $ok = Hwp-MoveToSectionAndLabel -HwpObj $HwpObj -SectionTitle $SectionTitle -Label $Label -LabelOccurrence $LabelOccurrence
  if (-not $ok) { return $false }

  for ($i = 0; $i -lt [Math]::Max(0, $Down); $i++) {
    try { $HwpObj.HAction.Run('TableLowerCell') | Out-Null } catch {}
  }
  for ($i = 0; $i -lt [Math]::Max(0, $Right); $i++) {
    try { $HwpObj.HAction.Run('TableRightCell') | Out-Null } catch {}
  }

  try { $HwpObj.HAction.Run('SelectAll') | Out-Null } catch {}
  try { $HwpObj.HAction.Run('Delete') | Out-Null } catch {}
  Hwp-InsertText -HwpObj $HwpObj -Text $text
  return $true
}

function Hwp-SetTableImageBelowLabelInSection {
  param(
    [Parameter(Mandatory = $true)] $HwpObj,
    [Parameter(Mandatory = $true)] [string]$SectionTitle,
    [Parameter(Mandatory = $true)] [string]$Label,
    [string]$ImagePath,
    [int]$LabelOccurrence = 1,
    [int]$Down = 1,
    [int]$Right = 0,
    [AllowEmptyString()][string]$FallbackText = ''
  )

  if ([string]::IsNullOrWhiteSpace($ImagePath) -and [string]::IsNullOrWhiteSpace($FallbackText)) {
    return $false
  }

  $ok = Hwp-MoveToSectionAndLabel -HwpObj $HwpObj -SectionTitle $SectionTitle -Label $Label -LabelOccurrence $LabelOccurrence
  if (-not $ok) { return $false }

  for ($i = 0; $i -lt [Math]::Max(0, $Down); $i++) {
    try { $HwpObj.HAction.Run('TableLowerCell') | Out-Null } catch {}
  }
  for ($i = 0; $i -lt [Math]::Max(0, $Right); $i++) {
    try { $HwpObj.HAction.Run('TableRightCell') | Out-Null } catch {}
  }

  try { $HwpObj.HAction.Run('SelectAll') | Out-Null } catch {}
  try { $HwpObj.HAction.Run('Delete') | Out-Null } catch {}
  Hwp-InsertImageOrText -HwpObj $HwpObj -ImagePath $ImagePath -FallbackText $FallbackText
  return $true
}

function Hwp-CreateTable {
  param(
    [Parameter(Mandatory = $true)] $HwpObj,
    [Parameter(Mandatory = $true)] [int]$Rows,
    [Parameter(Mandatory = $true)] [int]$Cols
  )
  $HwpObj.HAction.GetDefault('TableCreate', $HwpObj.HParameterSet.HTableCreation.HSet)
  $table = $HwpObj.HParameterSet.HTableCreation
  $table.Rows = [Math]::Max(1, $Rows)
  $table.Cols = [Math]::Max(1, $Cols)
  $table.WidthType = 2
  $HwpObj.HAction.Execute('TableCreate', $table.HSet) | Out-Null
}

function Hwp-MoveDocEnd {
  param(
    [Parameter(Mandatory = $true)] $HwpObj
  )
  try { $HwpObj.HAction.Run('CloseEx') | Out-Null } catch {}
  try { $HwpObj.HAction.Run('Cancel') | Out-Null } catch {}
  try { $HwpObj.HAction.Run('MoveDocEnd') | Out-Null } catch {}
}

function Resolve-ImagePath {
  param(
    [string]$RawValue,
    [Parameter(Mandatory = $true)] [string]$ImageDir,
    [Parameter(Mandatory = $true)] [string]$Prefix
  )
  $value = To-Text $RawValue
  if ([string]::IsNullOrWhiteSpace($value)) { return $null }

  function Optimize-ImageForHwp {
    param(
      [Parameter(Mandatory = $true)] [string]$SourcePath,
      [Parameter(Mandatory = $true)] [string]$OutDir,
      [Parameter(Mandatory = $true)] [string]$NamePrefix
    )

    if (-not (Test-Path -LiteralPath $SourcePath)) { return $null }

    $ext = [IO.Path]::GetExtension($SourcePath).ToLowerInvariant()
    if ($ext -notin @('.jpg', '.jpeg', '.png', '.bmp', '.gif')) {
      return $SourcePath
    }

    try {
      Add-Type -AssemblyName System.Drawing -ErrorAction Stop
    } catch {
      return $SourcePath
    }

    $img = $null
    $bmp = $null
    $graphics = $null
    $encParams = $null
    try {
      $img = [System.Drawing.Image]::FromFile($SourcePath)
      $maxEdge = 1800.0
      $maxCurrent = [Math]::Max([double]$img.Width, [double]$img.Height)
      $scale = if ($maxCurrent -gt $maxEdge) { $maxEdge / $maxCurrent } else { 1.0 }
      $newW = [Math]::Max(1, [int][Math]::Round($img.Width * $scale))
      $newH = [Math]::Max(1, [int][Math]::Round($img.Height * $scale))

      $bmp = New-Object System.Drawing.Bitmap $newW, $newH
      $graphics = [System.Drawing.Graphics]::FromImage($bmp)
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
      $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $graphics.DrawImage($img, 0, 0, $newW, $newH)

      $outPath = Join-Path $OutDir ("$NamePrefix-" + ([Guid]::NewGuid().ToString('N').Substring(0, 10)) + '.jpg')
      $jpgCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' } | Select-Object -First 1
      if ($null -ne $jpgCodec) {
        $encParams = New-Object System.Drawing.Imaging.EncoderParameters 1
        $encParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), 82L
        $bmp.Save($outPath, $jpgCodec, $encParams)
      } else {
        $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Jpeg)
      }
      return $outPath
    } catch {
      return $SourcePath
    } finally {
      if ($null -ne $encParams) { try { $encParams.Dispose() } catch {} }
      if ($null -ne $graphics) { try { $graphics.Dispose() } catch {} }
      if ($null -ne $bmp) { try { $bmp.Dispose() } catch {} }
      if ($null -ne $img) { try { $img.Dispose() } catch {} }
    }
  }

  if ($value -match '^https?://') {
    $name = "$Prefix-" + ([Guid]::NewGuid().ToString('N').Substring(0, 10)) + '.jpg'
    $outPath = Join-Path $ImageDir $name
    try {
      Invoke-WebRequest -Uri $value -OutFile $outPath -TimeoutSec 30 | Out-Null
      if (Test-Path -LiteralPath $outPath) {
        return Optimize-ImageForHwp -SourcePath $outPath -OutDir $ImageDir -NamePrefix $Prefix
      }
    } catch {
      return $null
    }
    return $null
  }

  if (Test-Path -LiteralPath $value) {
    return Optimize-ImageForHwp -SourcePath $value -OutDir $ImageDir -NamePrefix $Prefix
  }
  return $null
}

function Hwp-InsertImageOrText {
  param(
    [Parameter(Mandatory = $true)] $HwpObj,
    [string]$ImagePath,
    [AllowEmptyString()][string]$FallbackText = ''
  )
  if (-not [string]::IsNullOrWhiteSpace($ImagePath) -and (Test-Path -LiteralPath $ImagePath)) {
    try {
      $HwpObj.Insert($ImagePath, '', '') | Out-Null
      return
    } catch {}
  }
  if (-not [string]::IsNullOrWhiteSpace($FallbackText)) {
    Hwp-InsertText -HwpObj $HwpObj -Text $FallbackText
  }
}

$hwp = $null
try {
  $hwp = New-Object -ComObject HWPFrame.HwpObject

  try {
    $window = $hwp.XHwpWindows.Item(0)
    if ($null -ne $window) { $window.Visible = $false }
  } catch {}

  foreach ($moduleName in @('AutomationModule', 'FilePathCheckerModule')) {
    try {
      $hwp.RegisterModule('FilePathCheckDLL', $moduleName) | Out-Null
    } catch {}
  }

  $opened = $hwp.Open($OutputPath, '', '')
  if (-not $opened) {
    throw "Failed to open template output: $OutputPath"
  }

  # Requested font "휴면명조" (U+D734 U+BA74 U+BA85 U+C870)
  $requestedFont = ([char]0xD734) + ([char]0xBA74) + ([char]0xBA85) + ([char]0xC870)
  # Fallback "휴먼명조" (U+D734 U+BA3C U+BA85 U+C870)
  $fallbackFont = ([char]0xD734) + ([char]0xBA3C) + ([char]0xBA85) + ([char]0xC870)
  try {
    Hwp-ApplyFont -HwpObj $hwp -FontName $requestedFont
  } catch {
    Hwp-ApplyFont -HwpObj $hwp -FontName $fallbackFont
  }

  $inspection = $payload.inspection
  $results = @($payload.results)
  $photos = @($payload.photos)
  $project = $payload.project

  $projectName = To-Text $project.project_name
  $inspectionDate = To-DateText $inspection.inspection_date
  $inspectionDateKor = To-KoreanDateText $inspection.inspection_date
  $inspectionTeam = To-Text $inspection.inspection_team
  $progress = To-Text $inspection.progress_rate
  if (-not [string]::IsNullOrWhiteSpace($progress) -and -not $progress.EndsWith('%')) {
    $progress = "$progress%"
  }

  # 양식 상단의 고정 문구를 주요 입력값으로 교체한다.
  if (-not [string]::IsNullOrWhiteSpace($projectName)) {
    Hwp-ReplaceAllText -HwpObj $hwp -FindText '건설현장 점검카드(사업명)' -ReplaceText ("건설현장 점검카드({0})" -f $projectName)
  }
  if (-not [string]::IsNullOrWhiteSpace($inspectionDate)) {
    Hwp-ReplaceAllText -HwpObj $hwp -FindText "○ 점검일시 : ’25.   .   ." -ReplaceText ("○ 점검일시 : {0}" -f $inspectionDate)
  }
  if (-not [string]::IsNullOrWhiteSpace($inspectionTeam)) {
    Hwp-ReplaceAllText -HwpObj $hwp -FindText '○ 점 검 반 : 점검반원 전원 실명제 기록' -ReplaceText ("○ 점 검 반 : {0}" -f $inspectionTeam)
  }
  if (-not [string]::IsNullOrWhiteSpace($inspectionDateKor)) {
    Hwp-ReplaceAllText -HwpObj $hwp -FindText '2025년     월     일' -ReplaceText $inspectionDateKor
  }

  # 점검개요 내부 표 셀에 직접 값을 채운다.
  [void](Hwp-SetTableCellBelowLabel -HwpObj $hwp -Label '관리주체' -Value (To-Text $inspection.management_entity))
  [void](Hwp-SetTableCellBelowLabel -HwpObj $hwp -Label '지구명' -Value (To-Text $inspection.district_name))
  [void](Hwp-SetTableCellBelowLabel -HwpObj $hwp -Label '총사업비' -Value (To-BudgetText $inspection.total_budget))
  [void](Hwp-SetTableCellBelowLabel -HwpObj $hwp -Label '주요공종' -Value (To-Text $inspection.major_work_type))
  [void](Hwp-SetTableCellBelowLabel -HwpObj $hwp -Label '비고' -Value (To-Text $inspection.contractor))
  [void](Hwp-SetTableCellBelowLabel -HwpObj $hwp -Label '도' -Value (To-Text $inspection.location_province))
  [void](Hwp-SetTableCellBelowLabel -HwpObj $hwp -Label '시군' -Value (To-Text $inspection.location_city))
  [void](Hwp-SetTableCellBelowLabel -HwpObj $hwp -Label '착공' -Value (To-DateText $inspection.construction_start))
  [void](Hwp-SetTableCellBelowLabel -HwpObj $hwp -Label '준공' -Value (To-DateText $inspection.construction_end_planned))
  [void](Hwp-SetTableCellBelowLabel -HwpObj $hwp -Label '공정율' -Value $progress)

  # 점검결과 내부 표(첫 행)에 대표 지적사항을 직접 기록한다.
  $firstResult = if ($results.Count -gt 0) { $results[0] } else { $null }
  $firstField = if ($null -ne $firstResult) { To-Text $firstResult.field_item } else { '' }
  if ([string]::IsNullOrWhiteSpace($firstField)) {
    $firstField = To-Text $inspection.inspection_type
  }
  $firstFinding = if ($null -ne $firstResult) { To-Text $firstResult.findings } else { '지적사항 없음' }
  $firstAction = if ($null -ne $firstResult) { To-Text $firstResult.action_items } else { '해당 없음' }

  [void](Hwp-SetTableCellBelowLabel -HwpObj $hwp -Label '분야(항목)' -Value $firstField)
  [void](Hwp-SetTableCellBelowLabel -HwpObj $hwp -Label '지적사항(수범사례)' -Value $firstFinding)
  [void](Hwp-SetTableCellBelowLabel -HwpObj $hwp -Label '조치할 사항' -Value $firstAction)

  # 사진 URL을 로컬 임시 파일로 해석한다.
  $firstBeforeImagePath = if ($null -ne $firstResult) {
    Resolve-ImagePath -RawValue (To-Text $firstResult.photo_url) -ImageDir $workDir -Prefix 'result-before-1'
  } else { $null }
  $firstAfterImagePath = if ($null -ne $firstResult) {
    Resolve-ImagePath -RawValue (To-Text $firstResult.after_photo_url) -ImageDir $workDir -Prefix 'result-after-1'
  } else { $null }

  $siteBeforePhoto = $photos | Where-Object { (To-Text $_.photo_type) -eq 'site_before' } | Select-Object -First 1
  $goodExamplePhotos = @($photos | Where-Object { (To-Text $_.photo_type) -eq 'good_example' })
  $siteBeforeImagePath = if ($null -ne $siteBeforePhoto) {
    Resolve-ImagePath -RawValue (To-Text $siteBeforePhoto.photo_url) -ImageDir $workDir -Prefix 'site-before'
  } else { $null }
  $goodExampleImagePath1 = if ($goodExamplePhotos.Count -ge 1) {
    Resolve-ImagePath -RawValue (To-Text $goodExamplePhotos[0].photo_url) -ImageDir $workDir -Prefix 'good-example-1'
  } else { $null }
  $goodExampleImagePath2 = if ($goodExamplePhotos.Count -ge 2) {
    Resolve-ImagePath -RawValue (To-Text $goodExamplePhotos[1].photo_url) -ImageDir $workDir -Prefix 'good-example-2'
  } else { $null }

  $displayBeforeImagePath = if (-not [string]::IsNullOrWhiteSpace($siteBeforeImagePath)) {
    $siteBeforeImagePath
  } else {
    $firstBeforeImagePath
  }
  $displayAfterImagePath = if (-not [string]::IsNullOrWhiteSpace($firstAfterImagePath)) {
    $firstAfterImagePath
  } else {
    $displayBeforeImagePath
  }

  # 4. 건설현장 점검사진: 메타/사진 입력
  $sectionMainPhoto = '건설현장 점검사진'
  [void](Hwp-SetTableCellBelowLabelInSection -HwpObj $hwp -SectionTitle $sectionMainPhoto -Label '지구명' -LabelOccurrence 1 -Value (To-Text $inspection.district_name))
  [void](Hwp-SetTableCellBelowLabelInSection -HwpObj $hwp -SectionTitle $sectionMainPhoto -Label '공사감독원' -LabelOccurrence 1 -Value (To-Text $inspection.supervisor_name))
  [void](Hwp-SetTableCellBelowLabelInSection -HwpObj $hwp -SectionTitle $sectionMainPhoto -Label '일  시' -LabelOccurrence 1 -Value (To-DateText $inspection.inspection_date))
  [void](Hwp-SetTableCellBelowLabelInSection -HwpObj $hwp -SectionTitle $sectionMainPhoto -Label '지구명' -LabelOccurrence 2 -Value (To-Text $inspection.district_name))
  [void](Hwp-SetTableCellBelowLabelInSection -HwpObj $hwp -SectionTitle $sectionMainPhoto -Label '공사감독원' -LabelOccurrence 2 -Value (To-Text $inspection.supervisor_name))
  [void](Hwp-SetTableCellBelowLabelInSection -HwpObj $hwp -SectionTitle $sectionMainPhoto -Label '일  시' -LabelOccurrence 2 -Value (To-DateText $inspection.inspection_date))
  [void](Hwp-SetTableImageBelowLabelInSection -HwpObj $hwp -SectionTitle $sectionMainPhoto -Label '(조치 전)' -LabelOccurrence 1 -ImagePath $displayBeforeImagePath)
  [void](Hwp-SetTableImageBelowLabelInSection -HwpObj $hwp -SectionTitle $sectionMainPhoto -Label '(조치 후)' -LabelOccurrence 1 -ImagePath $displayAfterImagePath)

  # 5. 지적사항 및 조치사항 사진대지: 메타/사진 입력
  $sectionIssuePhoto = '<지적사항 및 조치사항 사진대지>'
  [void](Hwp-SetTableCellBelowLabelInSection -HwpObj $hwp -SectionTitle $sectionIssuePhoto -Label '지구명' -LabelOccurrence 1 -Value (To-Text $inspection.district_name))
  [void](Hwp-SetTableCellBelowLabelInSection -HwpObj $hwp -SectionTitle $sectionIssuePhoto -Label '공사감독원' -LabelOccurrence 1 -Value (To-Text $inspection.supervisor_name))
  [void](Hwp-SetTableCellBelowLabelInSection -HwpObj $hwp -SectionTitle $sectionIssuePhoto -Label '일  시' -LabelOccurrence 1 -Value (To-DateText $inspection.inspection_date))
  [void](Hwp-SetTableCellBelowLabelInSection -HwpObj $hwp -SectionTitle $sectionIssuePhoto -Label '지구명' -LabelOccurrence 2 -Value (To-Text $inspection.district_name))
  [void](Hwp-SetTableCellBelowLabelInSection -HwpObj $hwp -SectionTitle $sectionIssuePhoto -Label '공사감독원' -LabelOccurrence 2 -Value (To-Text $inspection.supervisor_name))
  [void](Hwp-SetTableCellBelowLabelInSection -HwpObj $hwp -SectionTitle $sectionIssuePhoto -Label '일  시' -LabelOccurrence 2 -Value (To-DateText $inspection.inspection_date))
  [void](Hwp-SetTableImageBelowLabelInSection -HwpObj $hwp -SectionTitle $sectionIssuePhoto -Label '(조치 전)' -LabelOccurrence 1 -ImagePath $firstBeforeImagePath)
  [void](Hwp-SetTableImageBelowLabelInSection -HwpObj $hwp -SectionTitle $sectionIssuePhoto -Label '(조치 후)' -LabelOccurrence 1 -ImagePath $firstAfterImagePath)

  # 6. 수범사례 사진대지: 메타/사진 입력
  $sectionGoodPhoto = '<수범사례 사진대지>'
  [void](Hwp-SetTableCellBelowLabelInSection -HwpObj $hwp -SectionTitle $sectionGoodPhoto -Label '지구명' -LabelOccurrence 1 -Value (To-Text $inspection.district_name))
  [void](Hwp-SetTableCellBelowLabelInSection -HwpObj $hwp -SectionTitle $sectionGoodPhoto -Label '지구명' -LabelOccurrence 2 -Value (To-Text $inspection.district_name))
  [void](Hwp-SetTableImageBelowLabelInSection -HwpObj $hwp -SectionTitle $sectionGoodPhoto -Label '설  명' -LabelOccurrence 1 -ImagePath $goodExampleImagePath1)
  [void](Hwp-SetTableImageBelowLabelInSection -HwpObj $hwp -SectionTitle $sectionGoodPhoto -Label '설  명' -LabelOccurrence 2 -ImagePath $goodExampleImagePath2)

  Hwp-MoveDocEnd -HwpObj $hwp
  $saved = $hwp.SaveAs($OutputPath, 'HWP', '')
  if (-not $saved) {
    throw "Failed to save HWP: $OutputPath"
  }
}
finally {
  if ($null -ne $hwp) {
    try { $hwp.Quit() | Out-Null } catch {}
    try { [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($hwp) } catch {}
  }
  try {
    if (Test-Path -LiteralPath $workDir) {
      Remove-Item -LiteralPath $workDir -Recurse -Force -ErrorAction SilentlyContinue
    }
  } catch {}
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}









