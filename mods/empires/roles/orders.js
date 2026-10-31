// Phase 2 unit orders for the command card (SPEC §14.4). Built out in Phase 2;
// until then the command card keeps its Phase 1 slots.
export function orders(card) {
  return card.slots();
}
