import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MotionCustomizer, MotionEditor, MotionGallery } from "@nous/motion/editor";
import { createMemoryAdapter, defaultsOf, defaultRegistry } from "../src";

describe("editor", () => {
  it("galeria lista os 6 templates do loader e seleciona", () => {
    const onSelect = vi.fn();
    render(<MotionGallery component="loader" onSelect={onSelect} />);
    expect(screen.getAllByRole("button")).toHaveLength(6); // só os botões de escolha; prévias são aria-hidden
    fireEvent.click(screen.getByRole("button", { name: /Onda/ }));
    expect(onSelect).toHaveBeenCalledWith("wave");
  });
  it("galeria de botão tem 10 e a de transição 4", () => {
    const { unmount } = render(<MotionGallery component="button" onSelect={() => {}} />);
    expect(screen.getAllByRole("button")).toHaveLength(10);
    unmount();
    render(<MotionGallery component="transition" onSelect={() => {}} />);
    expect(screen.getAllByRole("button")).toHaveLength(4);
  });
  it("customizador emite só valores válidos", () => {
    const onChange = vi.fn();
    const params = defaultsOf(defaultRegistry.get("loader")!.params);
    render(<MotionCustomizer component="loader" parameters={params} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Tamanho (px)"), { target: { value: "96" } });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]![0].size).toBe(96);
    // logo com javascript: é rejeitado e nada é emitido
    fireEvent.change(screen.getByLabelText("Logo (URL https ou data:image)"), { target: { value: "javascript:alert(1)" } });
    expect(onChange).toHaveBeenCalledTimes(1);
  });
  it("editor atualiza o preview em tempo real e salva no adaptador", async () => {
    const storage = createMemoryAdapter();
    const { container } = render(<MotionEditor storage={storage} />);
    expect(container.querySelector(".nm-ed__preview .nm-loader")).toHaveAttribute("data-template", "orbit");
    fireEvent.click(screen.getAllByRole("button", { name: /Pulso/ })[0]!);
    expect(container.querySelector(".nm-ed__work .nm-loader")).toHaveAttribute("data-template", "pulse");
    fireEvent.click(screen.getByRole("button", { name: "Salvar preset" }));
    await waitFor(async () => expect((await storage.list())[0]?.template).toBe("pulse"));
  });
});
