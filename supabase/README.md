# Supabase setup for MiniCrew

## 자동 점검(선택)

1. `.env.local`에 아래 값을 설정합니다.
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_PROJECT_REF` (선택: URL에서 자동 파싱 가능)

2. 필요할 때만 아래 명령으로 실행합니다.
- `npm run db:ensure`
- 필수 테이블이 없으면 `supabase/schema.sql`을 자동 적용합니다.
- 이미 존재하면 그대로 통과합니다.

## 수동 방식

1. Supabase 대시보드 -> SQL Editor 열기
2. [`supabase/schema.sql`](./schema.sql) 실행

## 참고

- 현재 정책은 데모 모드로 `anon`도 CRUD 가능하게 열려 있습니다.
- 추후 로그인 권한 분리 시 RLS를 사용자/프로젝트 멤버 기반으로 좁혀야 합니다.
- 최신 스키마에는 `user_profiles`, `project_invitations`, `project_join_requests`가 포함되어 있습니다.
- 소셜 로그인 사용 시 Supabase Auth Redirect URL은 `https://<your-domain>/auth/callback` (로컬은 `http://localhost:3000/auth/callback`)로 등록해야 합니다.
