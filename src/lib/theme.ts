/**
 * Tema claro/escuro do painel da equipe.
 *
 * A paleta escura já existia inteira no styles.css (bloco `.dark`) — faltava só alguém pôr a
 * classe no <html>. É isso que este módulo faz.
 *
 * A preferência é POR DISPOSITIVO (localStorage), não por tenant no banco: o PC do balcão fica
 * horas ligado num salão escuro e pede tema escuro; o celular do dono, no claro do dia, pede o
 * contrário. São a mesma conta, e uma preferência salva no banco obrigaria os dois a concordarem.
 *
 * Só vale no painel (/caixa). As telas do cliente seguem com as cores da marca do bar — é o que
 * elas existem pra mostrar, e escurecê-las brigaria com a identidade configurada no perfil.
 */

export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "pop9bar:theme";

/** Lê a preferência salva; sem nada salvo, segue o tema do sistema operacional. */
export function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "dark" || stored === "light") return stored;
  } catch {
    // Navegador com armazenamento bloqueado (aba anônima, política de privacidade): não é erro,
    // só quer dizer que não há preferência salva.
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

export function storeTheme(theme: Theme) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Sem persistência, o tema ainda vale nesta sessão — melhor do que quebrar o clique.
  }
}

/**
 * Roda inline no <head>, antes da primeira pintura. Sem isso a página nasce branca e só escurece
 * quando o React monta — o "flash" branco que arde nos olhos justamente de madrugada, que é quando
 * o tema escuro serve pra alguma coisa.
 *
 * Vai como string porque precisa ser executado antes do bundle carregar. Mantido pequeno e sem
 * dependências de propósito: é código que roda em toda visita.
 */
export const THEME_INIT_SCRIPT = `(function(){try{
if(!location.pathname.startsWith('/caixa'))return;
var s=localStorage.getItem('${THEME_STORAGE_KEY}');
var d=s==='dark'||(!s&&window.matchMedia('(prefers-color-scheme: dark)').matches);
if(d)document.documentElement.classList.add('dark');
}catch(e){}})();`;
