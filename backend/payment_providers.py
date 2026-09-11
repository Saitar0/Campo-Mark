"""Arquitetura preparada para integração futura com maquininhas de cartão (FASE FUTURA).

Objetivo (item 5 do roadmap): sincronizar automaticamente pagamentos feitos na
maquininha física do dono do campo com o status da reserva, eliminando o
"Marcar como pago" manual (POST /api/owner/bookings/{id}/mark-paid).

Ponto de extensão já existente:
- Booking tem `payment_method` ("online" | "on_site") e `payment_status`
  ("pending" | "pending_on_site" | "paid" | "refunded").
- Reservas "on_site" pagas na maquininha hoje são confirmadas manualmente via
  mark-paid. Uma integração futura deve apenas chamar a mesma transição:
  payment_status -> "paid", opcionalmente anexando `external_payment`:
    {"provider": "mercadopago_point" | "stone" | "pagseguro" | "sumup",
     "external_id": str, "amount": float, "synced_at": iso8601}

Viabilidade por provedor (pesquisa preliminar, validar na época da integração):
- Mercado Pago Point: API REST pública com webhooks de pagamento por terminal.
  Mais viável tecnicamente; requer conta MP do dono + OAuth.
- SumUp: API pública (Transactions/Readers) com OAuth; viável.
- Stone: APIs de parceiro com credenciamento prévio; viável porém burocrático.
- PagSeguro (Moderninha/PlugPag): integração local/SDK; webhook público limitado;
  provavelmente exige app bridge — menor prioridade.

Cada provedor = projeto separado de integração (adapter abaixo), a ser avaliado
após o MVP estabilizar. Nenhuma dependência externa é necessária hoje.
"""

from abc import ABC, abstractmethod


class PaymentTerminalProvider(ABC):
    """Adapter para um provedor de maquininha. Implementar em projeto separado."""

    name: str = ""

    @abstractmethod
    async def register_terminal(self, owner_id: str, credentials: dict) -> dict: ...

    @abstractmethod
    async def handle_webhook(self, payload: dict) -> dict:
        """Deve localizar a reserva e marcar payment_status='paid' via mark-paid."""
        ...


PROVIDERS: dict[str, type[PaymentTerminalProvider]] = {}


def register_provider(cls: type[PaymentTerminalProvider]):
    PROVIDERS[cls.name] = cls
    return cls
