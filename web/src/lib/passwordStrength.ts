/** Força da senha para o medidor visual (0..4). Sem dependências: fica no carregamento inicial. */
export function passwordStrength(pw: string): { score: number; label: string } {
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s++;
  return { score: s, label: ['Muito fraca', 'Fraca', 'Razoável', 'Boa', 'Forte'][s]! };
}
