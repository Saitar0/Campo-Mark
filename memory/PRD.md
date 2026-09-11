# CampoMark — PRD

## Problema (statement original)
Plataforma SaaS para donos de campos/quadras de futebol (society, futsal, campo aberto) gerenciarem horários, reservas e pagamentos. Assinatura mensal para donos; clientes finais usam grátis.

## Arquitetura
- **Backend**: FastAPI + MongoDB. Módulos: `server.py` (startup/seeds/índices/migrations), `deps.py` (db, JWT, guards, slots, moedas, auditoria), `auth_routes.py` (JWT + Google OAuth + reset senha), `field_routes.py` (campos, disponibilidade, geo, países), `booking_routes.py` (reservas, mark-paid, comprovantes), `payment_routes.py` (Stripe: reservas + assinatura + webhook), `admin_routes.py` (métricas, gestão avançada de donos/campos, auditoria), `email_service.py` (Resend gerenciado + guardrails), `whatsapp_service.py` (Twilio no-op sem credenciais), `storage_service.py` (object storage Emergent para comprovantes), `payment_providers.py` (stub para maquininhas — fase futura)
- **Frontend**: React + Tailwind + shadcn/ui. `LangContext` (PT/EN/ES + país + detecção automática), `AuthContext` (JWT + Google), Navbar com seletor de país/idioma/tema. Páginas: Landing, FieldDetail, AuthPages (+Google), MyBookings, OwnerDashboard (Agenda/Campos/Faturamento/Assinatura), AdminDashboard (+OwnerDetail), PaymentResult. Componentes compartilhados: FieldFormDialog, ReceiptButton
- **Anti-overbooking**: índice único parcial MongoDB; pendências >60min expiram
- **Stripe**: sandbox BR claimable. Reservas = checkout dinâmico na moeda do campo; assinatura = lookup_key `campomark_pro_monthly` R$149/mês. Tax mode: diy (BR sem Stripe Tax). Comprovante automático via charge.receipt_url
- **Object storage**: comprovantes em `campomark/receipts/{booking_id}/` (máx 5MB, JPG/PNG/WEBP/PDF), soft-delete em db.files

## Personas
1. **Admin** (joaovitor.gallina09@gmail.com): métricas, gestão profunda de donos (ver como dono, editar perfil/campos, avisar, suspender/banir/deletar, ocultar campos), log de auditoria
2. **Dono de campo**: campos multi-país/moeda, grade semanal, bloqueios, agenda, faturamento, marcar pago no local, comprovantes
3. **Cliente final**: busca por país/cidade, disponibilidade em tempo real, reserva 3 passos, comprovante upload, cancelamento

## Implementado (2026-09-11, iteração 2 — i18n + dark mode + admin avançado + comprovantes)
- [x] Internacionalização: PT/EN/ES com detecção por navegador; seletor de país no header; detecção por IP (/api/geo via ipapi.co, fallback gracioso); banner "ainda não temos campos aqui" com CTA; moeda por país do campo (brl/usd/eur/gbp/ars/mxn/cop/clp); preferências manuais persistidas (não sobrescritas pela detecção)
- [x] Modo escuro: toggle no header, persistido em localStorage, sem flash (script inline no index.html), cobertura global via overrides CSS
- [x] Admin avançado: visualizar como dono (campos, reservas, faturamento do mês), editar perfil e campos em nome do dono, avisar (notificação + e-mail), suspender/banir/deletar conta, ocultar/excluir campo específico — tudo com confirmação e log de auditoria (quem/o quê/quando)
- [x] Pagamentos no local: status "pagamento pendente" até o dono marcar como pago (agenda e faturamento); comprovante por reserva (automático Stripe para online; upload imagem/PDF para no local; consultável depois)
- [x] Ban/suspend bloqueia login JWT e Google; campos de contas inativas somem da busca pública

## Implementado (iteração 1 — MVP)
- Auth JWT 3 papéis + Google OAuth + reset de senha; reservas sem overbooking; Stripe; trial 7 dias; e-mails transacionais; painéis dono/admin; seeds demo

## Backlog priorizado
- **P0**: credenciais Twilio (WhatsApp real); claim do sandbox Stripe pelo usuário
- **P1**: login Apple (requer Apple Developer do usuário); avaliações; relatório financeiro exportável com comprovantes (PDF/Excel); integração maquininhas (adapters em payment_providers.py — Mercado Pago Point e SumUp são os mais viáveis)
- **P2**: PWA/mobile; fidelidade; upload de fotos de campos via object storage (hoje URLs); split de pagamento entre jogadores

## Próximas tarefas
1. Testes E2E da iteração 2 (testing agent)
2. Revisão visual do dark mode em todas as telas
