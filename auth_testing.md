# Auth Testing Playbook (CampoMark)

Backend: FastAPI + MongoDB (motor). Cookies httpOnly (access 15min, refresh 7d). Credenciais em /app/memory/test_credentials.md.

## Step 1: MongoDB Verification
```
mongosh
use test_database
db.users.find({role: "admin"}).pretty()
db.users.findOne({role: "admin"}, {password_hash: 1})
```
Verify: bcrypt hash starts with `$2b$`; indexes exist on users.email (unique), login_attempts.identifier, login_attempts.email, password_reset_tokens.expires_at (TTL), password_reset_tokens.token_hash (unique), password_reset_requests.email, password_reset_requests.created_at (TTL), bookings uniq_active_slot (partial unique).

## Step 2: API Testing
```
API=$(grep REACT_APP_BACKEND_URL /app/frontend/.env | cut -d '=' -f2)
curl -c cookies.txt -X POST $API/api/auth/login -H "Content-Type: application/json" -d '{"email":"joaovitor.gallina09@gmail.com","password":"CampoMark@2026"}'
curl -b cookies.txt $API/api/auth/me
```
Login retorna o user e seta cookies access_token + refresh_token. /me retorna o mesmo user.

## Step 3: Password Reset
Do this first: set FRONTEND_URL="http://localhost:3000" in /app/backend/.env, restart backend, request reset for a registered account, get the full link from backend logs (fallback prints it), then restore the https URL and restart.
1. Register test account (role customer).
2. forgot-password para email registrado e nao registrado: respostas devem ser identicas (200 generico).
3. Completar o reset com o token do log: nova senha loga, antiga nao, reuso do link falha.
4. Throttle: 6 forgot-password em endereco novo -> so 5 tokens criados, respostas identicas.
5. Lockout clearance: 5 logins falhos -> reset -> login com nova senha deve funcionar.

## Notas
- Emails de reserva usam o proxy Emergent (EMERGENT_EMAIL_KEY). Testar envio real apenas com endereco registrado (ex.: delivered@resend.dev so para teste de integracao).
- WhatsApp: sem credenciais Twilio o envio e no-op (log only).

## Google OAuth (Emergent-managed)
- Botao "Continuar com Google" em /auth (data-testid="google-login-button") redireciona para https://auth.emergentagent.com/?redirect=<origin>/auth/callback[?role=owner]
- Callback: fragment #session_id detectado em render (App.js -> AuthCallback), troca via POST /api/auth/google/session {session_id, role}
- Backend chama GET https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data com header X-Session-ID
- Sessao persistida em db.user_sessions {user_id, session_token, expires_at 7d}; cookie httpOnly session_token (secure, samesite=none)
- get_current_user aceita access_token (JWT) OU session_token (Google) — cookie primeiro, Bearer como fallback
- Novo usuario Google: role customer por padrao (owner se ?role=owner no redirect); trial de 7 dias criado para owner
- Teste backend sem Google: session_id invalido deve retornar 401
