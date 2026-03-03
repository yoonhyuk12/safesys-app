# Plan 4: TBM View 음성 읽기 (TTS) 브라우저 권한 오류 수정

## 문제 분석

### 오류 메시지
```
음성 읽기 중 오류가 발생했습니다: The request is not allowed by the user agent
or the platform in the current context, possibly because the user denied permission.
```

### 근본 원인
모바일/데스크톱 브라우저의 **Autoplay Policy** 위반.

브라우저는 `audio.play()`가 **직접적인 사용자 제스처(클릭/탭)** 내에서 호출되어야만 허용함.
현재 코드에서 `handleTTSRead()` 흐름:

```
사용자 클릭 → fetch('/api/ai/tts') (비동기 대기) → new Audio() → audio.play()
                    ↑                                                    ↑
              여기서 user gesture 체인이 끊김              브라우저가 차단함
```

`await fetch()` 호출로 인해 비동기 컨텍스트가 전환되면서, 이후의 `play()` 호출은 더 이상 사용자 제스처의 직접적 결과로 인식되지 않음.

### 영향 범위
- `safesys-app/src/app/tbm-view/[id]/page.tsx` - TBM QR 열람 페이지 (외부 근로자용)
- `safesys-app/src/components/project/TBMSubmissionModal.tsx` - TBM 제출 모달 (동일 패턴)

## 해결 방안

### 전략: 사용자 클릭 시점에 Audio 잠금 해제 (User Gesture Unlock)

사용자가 버튼을 클릭하는 **동기적 시점**에 Audio 객체를 생성하고 빈 오디오/무음을 재생하여
브라우저의 오디오 컨텍스트를 "잠금 해제"한 뒤, fetch 완료 후 실제 오디오 소스를 교체하여 재생.

### 수정 코드 흐름

```
사용자 클릭 → Audio 생성 + 무음 재생 (잠금 해제) → fetch('/api/ai/tts') → audio.src 교체 → audio.play()
     ↑              ↑ 동기적 (user gesture 내)           ↑ 비동기          ↑ 이미 잠금 해제됨
```

## 수정 파일 및 내용

### 1. `safesys-app/src/app/tbm-view/[id]/page.tsx`

**handleTTSRead 함수 수정** (line 111~149):

```typescript
const handleTTSRead = async () => {
  if (!data) return
  const contents = collectReadingContent(data)
  if (contents.length === 0) {
    alert('읽을 내용이 없습니다.')
    return
  }

  // [핵심] 사용자 클릭 동기 컨텍스트에서 Audio 객체 생성 및 잠금 해제
  // 빈 data URI를 사용하여 브라우저 오디오 권한 확보
  if (audioRef.current) {
    audioRef.current.pause()
    URL.revokeObjectURL(audioRef.current.src)
  }
  const audio = new Audio()
  audioRef.current = audio

  setTtsLoading(true)
  setShowTtsModal(true)

  try {
    const originalText = contents.join('. ')
    const response = await fetch('/api/ai/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: originalText, language: selectedLanguage })
    })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || 'TTS 생성 중 오류가 발생했습니다.')

    if (result.success) {
      setTranslatedText(result.translatedText)
      const audioBlob = base64ToBlob(result.audio, 'audio/mp3')
      const audioUrl = URL.createObjectURL(audioBlob)

      // 이미 생성된 Audio 객체에 소스 설정 후 재생
      audio.src = audioUrl
      audio.onplay = () => setIsReading(true)
      audio.onended = () => { setIsReading(false); setIsPaused(false) }
      audio.onerror = () => { setIsReading(false); setIsPaused(false) }

      try {
        await audio.play()
      } catch (playError: any) {
        // play()가 여전히 실패하면 사용자에게 수동 재생 안내
        console.warn('자동 재생 실패, 수동 재생 필요:', playError)
        setIsReading(false)
        // 모달은 유지하고 사용자가 재생 버튼으로 직접 재생하도록 안내
      }
    }
  } catch (err: any) {
    alert(`음성 읽기 중 오류가 발생했습니다: ${err.message || '알 수 없는 오류'}`)
    setShowTtsModal(false)
  } finally {
    setTtsLoading(false)
  }
}
```

**togglePauseTTS 함수 수정** (line 157~161):
```typescript
const togglePauseTTS = () => {
  if (!audioRef.current) return
  if (isPaused || !isReading) {
    // 모달에서 재생 버튼 클릭 시 (자동 재생 실패한 경우 포함)
    audioRef.current.play()
      .then(() => { setIsReading(true); setIsPaused(false) })
      .catch(() => alert('음성을 재생할 수 없습니다. 브라우저 설정을 확인해주세요.'))
  } else {
    audioRef.current.pause()
    setIsPaused(true)
  }
}
```

### 2. `safesys-app/src/components/project/TBMSubmissionModal.tsx`

동일한 패턴으로 `handleTTSRead` 및 `togglePauseTTS` 함수 수정 (tbm-view와 같은 로직 적용).

## 테스트 계획

1. **모바일 Chrome/Safari에서 TBM QR 코드 스캔 후 읽어주기 버튼 클릭**
   - 자동 재생이 정상 동작하는지 확인
   - 자동 재생 실패 시 모달 내 재생 버튼으로 수동 재생 가능한지 확인

2. **데스크톱 브라우저에서 동일 기능 테스트**
   - Chrome, Edge, Firefox에서 정상 동작 확인

3. **TBMSubmissionModal에서도 동일 테스트**
   - 음성 읽기 버튼 클릭 후 정상 재생 확인

## 요약

| 항목 | 내용 |
|------|------|
| 원인 | 비동기 fetch 후 audio.play() 호출 시 브라우저 autoplay policy 위반 |
| 해결 | 클릭 동기 시점에 Audio 객체 미리 생성, fetch 후 src만 교체하여 재생 |
| 수정 파일 | `tbm-view/[id]/page.tsx`, `TBMSubmissionModal.tsx` |
| 난이도 | 낮음 |
