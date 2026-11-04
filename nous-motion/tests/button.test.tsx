import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NousButton } from "@nous/motion/button";

describe("NousButton", () => {
  it("é um <button> nativo, type=button por padrão", () => {
    render(<NousButton>Salvar</NousButton>);
    const b = screen.getByRole("button", { name: "Salvar" });
    expect(b.tagName).toBe("BUTTON");
    expect(b).toHaveAttribute("type", "button");
  });
  it("aceita type=submit e atributos nativos", () => {
    render(<NousButton type="submit" aria-label="Enviar" form="f">x</NousButton>);
    expect(screen.getByRole("button", { name: "Enviar" })).toHaveAttribute("type", "submit");
  });
  it.each(["pulse", "ripple", "glow", "magnetic", "scale", "slide", "success", "loading", "notification", "alert"] as const)(
    "template %s renderiza",
    (t) => {
      render(<NousButton template={t}>b</NousButton>);
      expect(screen.getByRole("button")).toHaveAttribute("data-template", t);
    },
  );
  it("ativa por teclado (Enter/Espaço) e mantém foco visível via :focus-visible", async () => {
    const onClick = vi.fn();
    render(<NousButton onClick={onClick}>Ok</NousButton>);
    await userEvent.tab();
    expect(screen.getByRole("button")).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard(" ");
    expect(onClick).toHaveBeenCalledTimes(2);
  });
  it("loading: aria-busy, não dispara onClick e mantém o foco", async () => {
    const onClick = vi.fn();
    render(<NousButton loading onClick={onClick}>Salvando</NousButton>);
    const b = screen.getByRole("button");
    expect(b).toHaveAttribute("aria-busy", "true");
    expect(b).not.toBeDisabled();
    await userEvent.click(b);
    expect(onClick).not.toHaveBeenCalled();
    expect(screen.getByText("Carregando")).toBeInTheDocument();
  });
  it("disabled nativo bloqueia clique", async () => {
    const onClick = vi.fn();
    render(<NousButton disabled onClick={onClick}>x</NousButton>);
    await userEvent.click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });
  it("sucesso/erro: ícone + texto para leitor de tela", () => {
    const { rerender } = render(<NousButton state="success">Ok</NousButton>);
    expect(screen.getByRole("button")).toHaveTextContent("✓");
    expect(screen.getByText("Concluído")).toBeInTheDocument();
    rerender(<NousButton state="error">Ok</NousButton>);
    expect(screen.getByRole("button")).toHaveTextContent("✕");
    expect(screen.getByText("Erro")).toBeInTheDocument();
  });
  it("magnetic não move sem suporte a hover (toque)", () => {
    // setup.ts: matchMedia.matches = false → sem hover
    render(<NousButton template="magnetic">m</NousButton>);
    const b = screen.getByRole("button");
    fireEvent.pointerMove(b, { clientX: 500, clientY: 500 });
    expect(b.style.getPropertyValue("--nm-mx")).toBe("");
  });
  it("magnetic move quando há hover e não há reduced-motion", () => {
    const orig = window.matchMedia;
    window.matchMedia = ((q: string) => ({ matches: q.includes("hover: hover"), media: q, addEventListener() {}, removeEventListener() {} })) as never;
    try {
      render(<NousButton template="magnetic">m</NousButton>);
      const b = screen.getByRole("button");
      b.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 40, right: 100, bottom: 40, x: 0, y: 0, toJSON() {} }) as DOMRect;
      // jsdom não tem PointerEvent: dispara o tipo "pointermove" com coordenadas via MouseEvent.
      b.dispatchEvent(new MouseEvent("pointermove", { clientX: 100, clientY: 20, bubbles: true }));
      expect(b.style.getPropertyValue("--nm-mx")).toBe("12.5px");
      fireEvent.pointerLeave(b);
      expect(b.style.getPropertyValue("--nm-mx")).toBe("0px");
    } finally { window.matchMedia = orig; }
  });
  it("ripple não cria efeito com reduced motion", () => {
    render(<NousButton template="ripple" reducedMotion="always">r</NousButton>);
    const b = screen.getByRole("button");
    fireEvent.click(b, { clientX: 5, clientY: 5 });
    expect(b).not.toHaveAttribute("data-ripple");
  });
  it("ripple define o ponto do toque", () => {
    render(<NousButton template="ripple">r</NousButton>);
    const b = screen.getByRole("button");
    fireEvent.click(b, { clientX: 5, clientY: 7 });
    expect(b).toHaveAttribute("data-ripple", "on");
    expect(b.style.getPropertyValue("--nm-x")).toBe("5px");
  });
  it("selo de notificação só no template notification", () => {
    const { rerender } = render(<NousButton template="notification" badge={3}>n</NousButton>);
    expect(screen.getByText("3")).toBeInTheDocument();
    rerender(<NousButton template="scale" badge={3}>n</NousButton>);
    expect(screen.queryByText("3")).toBeNull();
  });
});
