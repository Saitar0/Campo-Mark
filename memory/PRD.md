# CampoMark — PRD

## Problema (statement original)
Plataforma SaaS para donos de campos/quadras de futebol (society, futsal, campo aberto) gerenciarem horários, reservas e pagamentos. Vendida por assinatura mensal aos donos; clientes finais usam grátis. Substitui organização por WhatsApp/papel/planilha, centralizando agenda, pagamento e comunicação.

## Arquitetura
- **Backend**: FastAPI + MongoDB (motor), módulos: `server.py` (startup/seeds/índices), `deps.py` (db, JWT, guards, slots), `auth_routes.py` (JWT + Google OAuth), `field_routes.py`, `booking_routes.py`, `payment_routes.py` (Stripe), `admin_routes.py`, `email_service.py` (Resend gerenciado + guardrails), `whatsapp_service.py` (Twilio, graceful no-op)
- **Frontend**: React + Tailwind + shadcn/ui. Contextos: AuthContext, LangContext (PT-BR/EN). Páginas: Landing (marketplace), FieldDetail (reserva 3 passos), AuthPages (+ Google), MyBookings, OwnerDashboard (Agenda/Campos/Faturamento/Assinatura), AdminDashboard, PaymentResult
- **Anti-overbooking**: índice único parcial MongoDB em bookings (field_id, date, start_time) para status pending_payment/confirmed; pendências >60min expiram
- **Pagamentos**: Stripe sandbox claimable (país BR). Reservas = checkout one-time com valor dinâmico server-side; assinatura = lookup_key `campomark_pro_monthly` R$149/mês. Tax mode: **diy** (sandbox BR não suporta Stripe Tax nem Managed Payments). Webhook em /api/stripe/webhook + poll em /api/payments/status/{session_id}
- **Auth**: JWT (access 15min + refresh 7d, cookies httpOnly) + Google OAuth gerenciado Emergent (session_token 7d em user_sessions). Reset de senha com token hash sha256 + TTL

## Personas
1. **Admin da plataforma** (joaovitor.gallina09@gmail.com): métricas, gestão de donos e assinaturas
2. **Dono de campo** (pagante): campos, grade semanal, preços por faixa, bloqueios, agenda, faturamento
3. **Cliente final**: busca, disponibilidade em tempo real, reserva em 3 passos, cancelamento

## Requisitos implementados (2026-09-11)
- [x] Cadastro/login 3 papéis (JWT) + Google social login + esqueci/redefinir senha + brute-force lockout
- [x] CRUD completo de campos com grade semanal por dia, preço por faixa, duração, itens inclusos, política de cancelamento, formas de pagamento
- [x] Calendário público de disponibilidade em tempo real sem overbooking
- [x] Reservas com confirmação automática (online via Stripe ou pagar no local)
- [x] Assinatura mensal dono de campo com trial in-app de 7 dias (TRIAL_DAYS)
- [x] Notificações: e-mail transacional (Resend gerenciado) + in-app (sino) + WhatsApp (MOCKADO — aguarda credenciais Twilio)
- [x] Painel de faturamento do dono (mês, online vs no local, por dia)
- [x] Painel admin: métricas (MRR, reservas, GMV, assinaturas), ativar/desativar donos
- [x] Interface PT-BR/EN com toggle
- [x] Seeds: admin real, owner demo (dono@campomark.com) com 3 campos, customer demo (jogador@campomark.com)

## Backlog priorizado
- **P0**: credenciais Twilio para WhatsApp real (usuário precisa fornecer); claim do sandbox Stripe pelo usuário (onboarding_url) para go-live
- **P1**: login Apple (requer conta Apple Developer do usuário); avaliações de campos; relatório financeiro exportável (PDF/Excel); divisão de custo entre jogadores (link de pagamento)
- **P2**: PWA/app mobile; programa de fidelidade; upload de fotos via object storage (hoje URLs)

## Próximas tarefas
1. Rodar testes E2E (testing agent) e corrigir bugs encontrados
2. Compartilhar link de claim do Stripe com o usuário
3. Coletar credenciais Twilio se WhatsApp for desejado em produção
