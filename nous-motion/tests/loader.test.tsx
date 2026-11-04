import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NousLoader } from "@nous/motion/loader";
import { Loading } from "../examples/react-demo/Loading";

describe("NousLoader", () => {
  it("exemplo do briefing renderiza (API alvo)", () => {
    const { container } = render(<Loading />);
    const el = container.querySelector(".nm-loader") as HTMLElement;
    expect(el).toHaveAttribute("data-template", "orbit");
    expect(el).toHaveAttribute("data-state", "loading");
    expect(el.style.getPropertyValue("--nm-primary")).toBe("#FF6B00");
    expect(el.style.getPropertyValue("--nm-size")).toBe("48px");
    // speed 1.2 → ciclo de 1.2/1.2 = 1s
    expect(el.style.getPropertyValue("--nm-cycle")).toBe("1s");
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
  it.each(["orbit", "pulse", "dots", "wave", "progress", "logo"] as const)("renderiza template %s", (t) => {
    const { container } = render(<NousLoader template={t} />);
    expect(container.querySelector(".nm-loader")).toHaveAttribute("data-template", t);
  });
  it("progresso real: mostra o valor informado", () => {
    render(<NousLoader template="progress" state="progress" progress={42} label="Enviando" />);
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "42");
    expect(bar).toHaveTextContent("42%");
  });
  it("sem valor real, fica indeterminado (não inventa progresso)", () => {
    render(<NousLoader template="progress" state="progress" />);
    expect(screen.getByRole("progressbar")).not.toHaveAttribute("aria-valuenow");
  });
  it("limita o progresso entre 0 e 100", () => {
    render(<NousLoader template="progress" state="progress" progress={250} />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
  });
  it("sucesso e erro têm ícone + texto, não só cor", () => {
    const { container, rerender } = render(<NousLoader state="success" />);
    expect(container.querySelector("svg")).toBeInTheDocument();
    expect(screen.getByText("Concluído")).toBeInTheDocument();
    rerender(<NousLoader state="error" />);
    expect(screen.getByText("Erro")).toBeInTheDocument();
    expect(container.querySelector(".nm-loader")).toHaveAttribute("data-anim", "off");
  });
  it("idle não anima", () => {
    const { container } = render(<NousLoader state="idle" />);
    expect(container.querySelector(".nm-loader")).toHaveAttribute("data-anim", "off");
  });
  it("reducedMotion='always' marca efeitos como desligados, mantendo o rótulo", () => {
    const { container } = render(<NousLoader reducedMotion="always" label="Salvando" />);
    expect(container.querySelector(".nm-loader")).toHaveAttribute("data-reduced", "true");
    expect(screen.getByText("Salvando")).toBeInTheDocument();
  });
  it("logo só aparece como imagem decorativa (alt vazio)", () => {
    const { container } = render(<NousLoader template="logo" logo="https://x.com/a.png" />);
    expect(container.querySelector("img")).toHaveAttribute("alt", "");
  });
});
