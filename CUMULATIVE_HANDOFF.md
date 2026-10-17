# FaceKeep Studio — 누적 개발 인수인계

최신: **v0.9.0 (2026-10-18)** · 공식 저장소: https://github.com/kdc916/FaceKeep-Studio · main 브랜치

## 프로젝트
- 단일 `index.html`의 인라인 JS/CSS, Canvas 2D 기반 브라우저 사진 편집 앱.
- 선택한 얼굴만 원본으로 유지하고 나머지 자동 검출된 얼굴을 이모티콘/PNG 스티커/모자이크/블러로 가림.
- 수동 얼굴 영역 추가/이동/리사이즈, PNG/JPG/WEBP 저장.
- 사진은 사용자 브라우저 안에서 처리하며 서버 업로드 없음.

## 개발 이력
- **v0.1.0:** 기본 UI, 얼굴 유지/가리기, MediaPipe CDN 기반 감지, 이미지 저장.
- **v0.2.0:** 오프라인 OpenCV Haar 정면 분류기 내장, 외부 감지 엔진 의존성 제거.
- **v0.3.0:** HEIC/HEIF 인식, 브라우저 미지원 시 heic-to 라이브러리 온라인 로드 및 JPEG 변환 경로.
- **v0.4.0:** 정면 기본/보조 + 양쪽 측면 모델, 작은 얼굴 타일 정밀 탐지 및 자동 보강, 진단 정보 복사.
- **v0.5.0:** 블러/모자이크 경계 외측에 Smoothstep 기반 투명 페더 추가. `softFeather` 0~60% (기본 22%). 타원형/직사각형 마스크 모두 지원. 얼굴 커버 내부는 알파 100%로 보호. 미리보기 리샘플링 소스 `state.previewSource` 사용. 모자이크 셀 크기를 페더 조절과 독립 계산.



## v0.9.0 — 고밀도 얼굴 탐지 (2026-10-18)
- 문제: 2048×819 단체사진에서 22개 탐지된 상태에서도 작은 얼굴이 일부 누락. 기존 tilesFor가 2×2 기반이라 AI 내부 입력 리사이즈에서 얼굴 신호가 약해짐.
- `ai-detector.js`의 `tilesFor(W,H,{detailed,dense})`를 픽셀 기준 겹침 그리드로 교체; `axisStarts`는 모서리 영역을 포함하여 일정한 간격으로 분할.
- 자동 모드 groupLike(가로/세로>=1.75, 폭>=1400)에서 dense target 420px, BlazeFace full+short 모델 모두 사용.
- 상세 모드 dense target 360px, 최대 40개 구역(원·근거리 2패스씩), 기존 coarse 타일과 회전 보정 유지.
- Face Landmarker 2차 검증과 손/옷 오탐 방어 기능 유지; 여러 겹쳐 잡힌 얼굴은 기존 후보 중복 제거 사용.
- `qa/panorama-small-faces.mjs` 새 테스트: 2048x819 Lena 얼굴 조각 20개를 가로 10열×2행에 70~95px 간격/각도/약한 블러로 배치. 감지 중심과 기준 얼굴 중심의 거리로 검출률 계산.
- 초기 dense (auto 620px, detailed 500px) quick 8/20, precise 19/20. 추가 튜닝 (auto 540px, detailed 360px) quick 16/20, precise 20/20. 최종 auto 420px의 회귀 테스트 결과도 확인할 것.
- 정확도를 위해 추론 패스가 증가하므로 모바일 실행시간/발열 유의. 손 오탐 방지, 9명 몽타주, 인생네컷 Fit/100% 회귀 테스트 재실행.
- 사용자 제공 이미지는 UI 스크린샷이므로 실제 깨끗한 원본 파일과 일치하는 검증은 아직 불가능.

## v0.8.1 — 얼굴 특징점 기반 오탐 제거 (2026-10-18)

문제: 영아의 손/옷 등 얼굴이 없는 이미지 패턴에 AI 및 Haar 감지 박스가 나타남. 사용자의 실제 화면에서는 아기 손이 `4 유지`로 표시됨. 원본 비가공 사진이 아닌 UI 스크린샷만 제공되어 동일 상황의 직접 인식 재현은 미완료.

수정:
- `ai-detector.js`에 MediaPipe `FaceLandmarker` 기반 `verifyClusters` / `verifyExtraCandidates` 추가.
- BlazeFace 모든 패스의 후보를 공간적으로 묶고, 원본 이미지에서 후보별 크롭으로 눈·코·얼굴 윤곽의 특징점 구조를 검사.
- `vendor/models/face_landmarker.task`는 `.github/workflows/vendor-face-ai.yml`에서 함께 다운로드/커밋.
- AI 감지 성공 시 Haar 보조 결과도 동일한 특징점 검증을 통과해야 등록 가능.
- 검증기가 준비되지 않은 경우 두 독립적 탐지 패스가 동시에 지지하는 높은 점수의 후보만 허용하는 제한 모드.
- `index.html`: 재감지할 때 이전 자동 생성 박스를 새 검증 결과에 맞게 갱신/제거, 수동 영역 보존, 기존 얼굴의 유지/가리기 상태 유지.
- 진단 필드: `faceLandmarks`, `rejected`, `removed`.

테스트:
- Chromium에서 MediaPipe Face Landmarker 모델 로딩 및 9개 얼굴 합성사진 9/9, 약한 블러 및 20도 기울기 얼굴 검출 확인.
- 손 사진과 실제 사용자 오탐 사례의 모델 직접 비교는 별도 회귀 테스트로 지속.
- 얼굴이 심하게 가려지거나 흔들린 사진에서 특징점 검증이 실제 얼굴을 제외할 수 있으므로 육안 확인 및 수동 추가 안내 필요.

## v0.8.0 — 세로 사진 Fit/100%·터치 이동
- 원인: 기존 `layoutCanvas`가 viewport 가로만으로 크기를 정함. 특히 모바일의 42vh 높이 제한으로 세로사진 끝이 스크롤 영역 뒤에 남아 마지막 컷에서 선택하기 어려움.
- 새 `layoutCanvas(centerOnZoom)`: `min((viewportWidth-24)/imageWidth,(viewportHeight-24)/imageHeight)`로 Fit 배율을 계산. 100/150/200%는 이미지 1픽셀을 CSS 1/1.5/2픽셀로 표시.
- UI: `#fitBtn`, `#actualBtn`, `#zoomSelect`(Fit/100/150/200), `#panMode`.
- `#viewport` 내부 스크롤 유지, 사용자 손가락/마우스 드래그로 상하좌우 이동하도록 `pointerdown`, `pointermove`, `pointerup`의 `pan` 상태 분기 추가.
- Face pill 선택하면 `focusFaceIfZoomed`로 확대 뷰에서 해당 인물 위치로 자동 이동. 사용자가 얼굴을 계속 눌러 유지/가리기를 전환 가능.
- Fit 재선택 시 `scrollTop`/`scrollLeft` 초기화.
- 모바일 뷰포트 높이 52dvh(최소 225px, 최대 480px), 데스크톱 72dvh(최소 340px, 최대 900px)로 명시적 관리.
- Browser QA: `qa/portrait-layout-smoke.mjs`에서 600×2400 세로 4컷, 모바일/태블릿/PC의 Fit 내부 전부 표시 → 100% 확대 → pan → 하단 얼굴 선택/토글 → 다시 Fit 확인.
- AI 추론·HEIC 변환·저장 이미지 좌표는 변경하지 않음.

## v0.7.0 — AI 우선 탐지 (2026-10-17)
- `ai-detector.js`: MediaPipe Tasks Vision `0.10.35`와 full-range / short-range BlazeFace, 사진 크기에 따라 중첩 타일 확대 탐지. 정밀 재탐지에 +/-20도 회전 보강.
- `index.html`: `detectFaces`를 AI 우선 → 필요 시 Haar 대체/정밀 보강 파이프라인으로 교체. 신경망 점수 우선으로 중복 제거, 진단에 aiWorked/aiError/aiPasses 기록.
- 정사각형 이모티콘: `cover`에서 긴 축과 1.08배 커버, `drawEmojiSquare` 오프스크린 캔버스 래스터화. 사용자 PNG 스티커 원래 비율 유지.
- `vendor/`: GitHub Actions가 Vision JS/WASM/모델을 GitHub 저장소에 다운로드 및 커밋하도록 구성. 앱은 자체 파일을 먼저 시도하고 없으면 CDN을 시도함.
- **검증 한계:** 정적 코드/브라우저 기본 동작은 확인 가능하나 이번 환경에서 외부 신경망 파일 다운로드가 차단되어 AI 추론에 대한 실제 사진 인식률 실험은 아직 미완료. GitHub Actions 자산 배포 성공 여부 별도 확인 필요.
- 외부 모델이 차단돼도 기존 Haar fallback이 실행됨. 에러는 '얼굴 감지 진단 정보'에서 확인.

## v0.5.1 레이아웃 수정 (2026-10-17)
- `.emoji-grid`: 7열 `repeat(7,minmax(0,1fr))`, `width/max-width:100%`, `min-width:0`으로 각 그리드 열의 최소 콘텐츠 크기로 인한 overflow 제거.
- `.emoji-btn`: `min-width:0`, `width/max-width:100%`, `min-height:0`, `aspect-ratio:1/1`, `overflow:hidden`, `padding:0` 으로 컨테이너 크기 준수.
- `.sidebar`/`.panel`: `min-width:0`으로 모바일 좁은 화면 폭에서도 과확장 방지.
- `.input-group #emojiApply`: 고정 최소 너비 64px, `white-space:nowrap`, 입력창 `flex:1 1 0`으로 '적용' 글자 줄바꿈 방지.
- UI 회귀 테스트: Chromium에서 1920/1440/1030/800/760/660/480/390/320px 뷰포트, 각 21개 이모지 7열 3행, 버튼 카드 경계 내 위치, 전체 가로 overflow=0, 입력/적용 버튼 정상, 페이지 JS 오류 0건.
- 얼굴 감지/모자이크/블러/HEIC 처리 로직은 변경하지 않음. Android 실기기 검증은 별도 필요.

## v0.5.0 주요 구현 위치
- UI: `#softOptions`, `#softFeather`, `#softFeatherV`.
- 변경 이벤트: `setEffect` / 슬라이더 `oninput`.
- 렌더링: `cover` → `applyFaceMask` → `renderSoftFace` → `maskFalloff`.
- `maskFalloff`: 커버 경계 내부 거리 <= 0이면 완전 불투명, 외측에서 smoothstep 페이드.
- `renderSoftFace`: 오프스크린 타일에서 모자이크/블러 후 알파 마스킹; 블러 샘플링은 반경에 비례해 패딩.
- `render`: 저해상도 preview source 기반 효과 렌더링, 얼굴 편집 테두리는 기존 원본 좌표 활용.
- 내보내기: 저장 버튼 클릭 시 원본/선택 해상도에서 동일 마스크 함수 재사용.

## 확인 사항
- Chromium 테스트: 9명 단체 이미지 감지 9개 유지.
- 모자이크/블러에서 소프트 슬라이더 표시 확인, 경계 페더 렌더링 스크린샷 확인.
- 타원형/사각형 마스크 토글, 원본 해상도 PNG 저장 정상.
- 자바스크립트 예외 0건, Node 문법 검사 통과.
- 실제 안드로이드 실기기 및 HEIC 외부 디코더 재검증은 하지 못함.

## 중요한 제약
- Haar 얼굴 자동 감지는 작은 얼굴/옆얼굴/가림/역광에서 누락될 수 있으므로 공유 전 육안 확인 및 수동 영역 추가 필수.
- 외부 라이브러리 변환이 필요한 HEIC는 인터넷이 필요하나 사진 자체는 업로드되지 않음.
- 고해상도 저장 시 메모리 사용량에 주의; 문제 발생 시 2048px 저장 권장.

## 다음 개발 시 정책
- 최신 main 소스를 먼저 읽은 다음 버전 갱신/리팩터링/실기기 동작 테스트.
- GitHub main에 직접 커밋하고 가능한 경우 배포 확인.
- 매 패치 ZIP + 최신 누적 인수인계 MD 제공.
