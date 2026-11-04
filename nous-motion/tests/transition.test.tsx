import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NousTransition } from "@nous/motion/transition";

describe("NousTransition", () => {
  it("monta visível e expõe os parâmetros como variáveis CSS", () => {
    const { container } = render(<NousTransition duration={0.5} delay={0.1} easing="ease-in" intensity={1.5}><p>oi</p></NousTransition>);
    const el = container.querySelector(".nm-t") as HTMLElement;
    expect(el).toHaveAttribute("data-visible", "true");
    expect(el.style.getPropertyValue("--nm-t-dur")).toBe("0.5s");
    expect(el.style.getPropertyValue("--nm-t-delay")).toBe("0.1s");
    expect(el.style.getPropertyValue("--nm-t-ease")).toBe("ease-in");
    expect(el.style.getPropertyValue("--nm-t-k")).toBe("1.5");
  });
  it.each(["fade", "slide", "scale", "collapse"] as const)("template %s", (t) => {
    const { container } = render(<NousTransition template={t} direction="left"><p>x</p></NousTransition>);
    expect(container.querySelector(".nm-t")).toHaveAttribute("data-template", t);
    expect(container.querySelector(".nm-t")).toHaveAttribute("data-direction", "left");
  });
  it("remove do DOM depois da saída (duração + atraso)", () => {
    vi.useFakeTimers();
    try {
      const { rerender } = render(<NousTransition show duration={0.3} delay={0.2}><p>conteúdo</p></NousTransition>);
      rerender(<NousTransition show={false} duration={0.3} delay={0.2}><p>conteúdo</p></NousTransition>);
      expect(screen.getByText("conteúdo")).toBeInTheDocument();
      act(() => { vi.advanceTimersByTime(499); });
      expect(screen.queryByText("conteúdo")).toBeInTheDocument();
      act(() => { vi.advanceTimersByTime(2); });
      expect(screen.queryByText("conteúdo")).toBeNull();
    } finally { vi.useRealTimers(); }
  });
  it("unmountOnExit=false só esconde", () => {
    vi.useFakeTimers();
    try {
      const { rerender, container } = render(<NousTransition show unmountOnExit={false} duration={0.1}><p>c</p></NousTransition>);
      rerender(<NousTransition show={false} unmountOnExit={false} duration={0.1}><p>c</p></NousTransition>);
      act(() => { vi.advanceTimersByTime(200); });
      expect(container.querySelector(".nm-t")).toHaveAttribute("hidden");
    } finally { vi.useRealTimers(); }
  });
  it("reduced motion zera duração e atraso", () => {
    const { container } = render(<NousTransition reducedMotion="always" duration={1} delay={1}><p>x</p></NousTransition>);
    const el = container.querySelector(".nm-t") as HTMLElement;
    expect(el.style.getPropertyValue("--nm-t-dur")).toBe("0s");
    expect(el.style.getPropertyValue("--nm-t-delay")).toBe("0s");
  });
});
