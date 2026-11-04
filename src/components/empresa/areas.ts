/**
 * Áreas do módulo Empresa. Uma lista só alimenta as abas, a visão geral e as páginas "preparadas",
 * para o nome e o estado de cada área nunca divergirem entre as três.
 *
 * `pronto`    = existe e funciona hoje.
 * `preparado` = a página existe e diz o que vai ter, mas ainda NÃO faz nada. Nunca finge dados.
 */
export type EmpresaStatus = "pronto" | "preparado";

export const EMPRESA_AREAS = [
  {
    key: "configuracoes",
    label: "Configurações",
    to: "/caixa/empresa/configuracoes",
    status: "pronto",
    hint: "Perfil e marca, senha da equipe, aparência, horário do expediente, taxa de serviço e sugestões.",
  },
  {
    key: "conexoes",
    label: "Conexões",
    to: "/caixa/empresa/conexoes",
    status: "pronto",
    hint: "Maquininha, verificação do celular, impressora e leitura de notas.",
  },
  {
    key: "inventario",
    label: "Inventário",
    to: "/caixa/empresa/inventario",
    status: "preparado",
    hint: "Cadastro dos bens duráveis da empresa: máquinas, geladeiras, mesas, decoração.",
  },
  {
    key: "gestao",
    label: "Gestão",
    to: "/caixa/empresa/gestao",
    status: "preparado",
    hint: "Freelancers, custos fixos, férias da equipe fixa e legislação.",
  },
  {
    key: "documentos",
    label: "Documentos",
    to: "/caixa/empresa/documentos",
    status: "preparado",
    hint: "Documentos fiscais, societários e jurídicos, licenças e alvarás.",
  },
] as const;

export type EmpresaAreaKey = (typeof EMPRESA_AREAS)[number]["key"];
