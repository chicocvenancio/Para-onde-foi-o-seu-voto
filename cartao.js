/*
 * Desenha o "cartão" do resultado em PNG, no próprio navegador (canvas), para
 * compartilhar como imagem: Stories (1080x1920) ou Feed (1080x1080).
 *
 * Cartao.desenhar(spec, formato) -> Promise<Blob>
 *   spec = { kicker, destaque, frase, partes: [{ nome, detalhe, pct, frac }], endereco }
 */
(function (global) {
  "use strict";

  const COR = { fundo: "#f6f5f1", cartao: "#ffffff", tinta: "#1d1f24", suave: "#5d6270", linha: "#e2e0d8", acento: "#0b6e4f" };
  const DISPLAY = '"Bricolage Grotesque", "Segoe UI", system-ui, sans-serif';
  const TEXTO = '"Source Sans 3", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  // mesmas cores da barra do site: hsl(160 + i*53, 55%, 45%)
  const corParte = (i) => `hsl(${(160 + i * 53) % 360}, 55%, 45%)`;

  const FORMATOS = {
    story: { w: 1080, h: 1920, pad: 96, padV: 240, kicker: 32, titulo: 108, destaque: 56, frase: 42, barra: 72, linha: 46, linhaAlt: 88, rodape: 38, maxLinhas: 8 },
    feed:  { w: 1080, h: 1080, pad: 80, padV: 80,  kicker: 26, titulo: 76,  destaque: 46, frase: 34, barra: 56, linha: 38, linhaAlt: 72,  rodape: 32, maxLinhas: 5 },
  };

  let fontesProntas = null;
  function carregarFontes() {
    if (!fontesProntas) {
      fontesProntas = Promise.all([
        document.fonts.load(`800 80px ${DISPLAY}`),
        document.fonts.load(`400 40px ${TEXTO}`),
        document.fonts.load(`700 40px ${TEXTO}`),
      ]).catch(() => null);
    }
    return fontesProntas;
  }

  let icone = null;
  function carregarIcone(src) {
    if (!icone) {
      icone = new Promise((ok) => {
        const img = new Image();
        img.onload = () => ok(img);
        img.onerror = () => ok(null);
        img.src = src;
      });
    }
    return icone;
  }

  // Quebra o texto em linhas que cabem em "largura".
  function quebrar(ctx, texto, largura) {
    const palavras = texto.split(/\s+/);
    const linhas = [];
    let atual = "";
    for (const p of palavras) {
      const teste = atual ? `${atual} ${p}` : p;
      if (ctx.measureText(teste).width <= largura || !atual) atual = teste;
      else { linhas.push(atual); atual = p; }
    }
    if (atual) linhas.push(atual);
    return linhas;
  }

  // Corta com "…" se não couber.
  function cortar(ctx, texto, largura) {
    if (ctx.measureText(texto).width <= largura) return texto;
    let t = texto;
    while (t.length > 1 && ctx.measureText(t + "…").width > largura) t = t.slice(0, -1);
    return t.trimEnd() + "…";
  }

  function retangulo(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h);
    ctx.fill();
  }

  function paragrafo(ctx, texto, x, y, largura, tamanho, alturaLinha, maxLinhas) {
    let linhas = quebrar(ctx, texto, largura);
    if (maxLinhas && linhas.length > maxLinhas) {
      linhas = linhas.slice(0, maxLinhas);
      linhas[maxLinhas - 1] = cortar(ctx, linhas[maxLinhas - 1] + "…", largura);
    }
    for (const l of linhas) { y += tamanho; ctx.fillText(l, x, y); y += alturaLinha - tamanho; }
    return y;
  }

  // Desenha título, frase, barra e lista a partir de y0; devolve onde terminou.
  function conteudo(ctx, f, spec, y0, yRodape) {
    const largura = f.w - 2 * f.pad;
    // ---- topo ----
    let y = y0;
    ctx.fillStyle = COR.acento;
    ctx.font = `700 ${f.kicker}px ${TEXTO}`;
    if ("letterSpacing" in ctx) ctx.letterSpacing = `${Math.round(f.kicker * 0.1)}px`;
    y = paragrafo(ctx, spec.kicker.toUpperCase(), f.pad, y, largura, f.kicker, f.kicker * 1.3, 2);
    if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";

    ctx.fillStyle = COR.tinta;
    ctx.font = `800 ${f.titulo}px ${DISPLAY}`;
    if ("letterSpacing" in ctx) ctx.letterSpacing = `${Math.round(-f.titulo * 0.03)}px`;
    y = paragrafo(ctx, "Para onde foi o meu voto?", f.pad, y + f.titulo * 0.35, largura, f.titulo, f.titulo * 1.02, 3);
    if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";

    ctx.fillStyle = COR.tinta;
    ctx.font = `700 ${f.destaque}px ${TEXTO}`;
    y = paragrafo(ctx, spec.destaque, f.pad, y + f.destaque * 0.8, largura, f.destaque, f.destaque * 1.2, 2);

    ctx.fillStyle = COR.suave;
    ctx.font = `400 ${f.frase}px ${TEXTO}`;
    y = paragrafo(ctx, spec.frase, f.pad, y + f.frase * 0.5, largura, f.frase, f.frase * 1.3, 4);

    // ---- barra e lista ----
    const partes = spec.partes || [];
    if (partes.length) {
      y += f.barra * 0.7;
      const gap = Math.max(4, Math.round(f.barra / 12));
      const util = largura - gap * (partes.length - 1);
      ctx.save();
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(f.pad, y, largura, f.barra, f.barra * 0.22) : ctx.rect(f.pad, y, largura, f.barra);
      ctx.clip();
      let x = f.pad;
      partes.forEach((p, i) => {
        const w = Math.max(3, util * p.frac);
        ctx.fillStyle = corParte(i);
        ctx.fillRect(x, y, w, f.barra);
        x += w + gap;
      });
      ctx.restore();
      y += f.barra + f.linha * 0.6;

      // quantas linhas cabem até o rodapé
      const espaco = yRodape - f.linha * 0.8 - y;
      let n = Math.min(partes.length, f.maxLinhas, Math.floor(espaco / f.linhaAlt));
      const sobra = partes.length - n;
      if (sobra > 0) n = Math.max(0, Math.min(n, Math.floor((espaco - f.linhaAlt * 0.7) / f.linhaAlt)));
      const quadrado = f.linha * 0.62;
      for (let i = 0; i < n; i++) {
        const p = partes[i];
        const base = y + f.linhaAlt * 0.62;
        ctx.fillStyle = corParte(i);
        retangulo(ctx, f.pad, base - quadrado * 0.95, quadrado, quadrado, quadrado * 0.25);
        ctx.font = `700 ${f.linha}px ${TEXTO}`;
        ctx.fillStyle = COR.tinta;
        const wPct = ctx.measureText(p.pct).width;
        ctx.textAlign = "right";
        ctx.fillText(p.pct, f.w - f.pad, base);
        ctx.textAlign = "left";
        ctx.font = `600 ${f.linha}px ${TEXTO}`;
        const xNome = f.pad + quadrado + f.linha * 0.5;
        const livre = f.w - f.pad - wPct - f.linha * 0.8 - xNome;
        const nome = cortar(ctx, p.nome, livre * 0.78);
        ctx.fillText(nome, xNome, base);
        if (p.detalhe) {
          const wNome = ctx.measureText(nome + "  ").width;
          ctx.font = `400 ${Math.round(f.linha * 0.72)}px ${TEXTO}`;
          ctx.fillStyle = COR.suave;
          ctx.fillText(cortar(ctx, p.detalhe, Math.max(0, livre - wNome)), xNome + wNome, base);
        }
        ctx.fillStyle = COR.linha;
        ctx.fillRect(f.pad, y + f.linhaAlt - 2, largura, 2);
        y += f.linhaAlt;
      }
      const resto = partes.length - n;
      if (resto > 0) {
        ctx.font = `400 ${Math.round(f.linha * 0.85)}px ${TEXTO}`;
        ctx.fillStyle = COR.suave;
        ctx.fillText(`e mais ${resto} ${resto === 1 ? "eleito" : "eleitos"}`, f.pad, y + f.linhaAlt * 0.6);
        y += f.linhaAlt * 0.8;
      }
    } else if (spec.numero) {
      // sem eleitos (branco, nulo, partido sem vagas): um número grande de contexto
      y += f.titulo * 0.6;
      ctx.fillStyle = COR.acento;
      ctx.font = `800 ${Math.round(f.titulo * 1.1)}px ${DISPLAY}`;
      ctx.fillText(spec.numero.valor, f.pad, y + f.titulo);
      ctx.fillStyle = COR.suave;
      ctx.font = `400 ${f.frase}px ${TEXTO}`;
      y = paragrafo(ctx, spec.numero.rotulo, f.pad, y + f.titulo * 1.25, largura, f.frase, f.frase * 1.3, 3);
    }

    return y;
  }

  async function desenhar(spec, formato) {
    const f = FORMATOS[formato];
    await carregarFontes();
    const img = await carregarIcone(spec.icone);

    const canvas = document.createElement("canvas");
    canvas.width = f.w; canvas.height = f.h;
    const ctx = canvas.getContext("2d");
    const largura = f.w - 2 * f.pad;
    ctx.textBaseline = "alphabetic";

    ctx.fillStyle = COR.fundo;
    ctx.fillRect(0, 0, f.w, f.h);

    // ---- rodapé (desenhado primeiro, para saber quanto espaço sobra) ----
    const altRodape = f.rodape * 3.2;
    // Nos Stories, a barra de perfil (topo) e a caixa de resposta (base) cobrem ~250 px.
    const yRodape = f.h - f.padV - altRodape;
    ctx.fillStyle = COR.linha;
    ctx.fillRect(f.pad, yRodape, largura, 3);
    const lado = f.rodape * 2.1;
    if (img) ctx.drawImage(img, f.pad, yRodape + (altRodape - lado) / 2 + 6, lado, lado);
    const xTexto = f.pad + (img ? lado + f.rodape * 0.6 : 0);
    ctx.fillStyle = COR.suave;
    ctx.font = `400 ${f.rodape}px ${TEXTO}`;
    ctx.fillText("Descubra para onde foi o seu voto:", xTexto, yRodape + f.rodape * 1.55);
    ctx.fillStyle = COR.acento;
    ctx.font = `700 ${f.rodape}px ${TEXTO}`;
    ctx.fillText(cortar(ctx, spec.endereco, f.w - f.pad - xTexto), xTexto, yRodape + f.rodape * 2.75);

    // ---- conteúdo: mede numa tela de rascunho e centraliza no espaço livre ----
    const rascunho = document.createElement("canvas");
    rascunho.width = f.w; rascunho.height = f.h;
    const rctx = rascunho.getContext("2d");
    const fim = conteudo(rctx, f, spec, f.padV, yRodape);
    const livre = yRodape - f.pad * 0.6 - fim;
    conteudo(ctx, f, spec, f.padV + Math.max(0, livre * 0.42), yRodape);

    return new Promise((ok, erro) => canvas.toBlob((b) => (b ? ok(b) : erro(new Error("Não foi possível gerar a imagem."))), "image/png"));
  }

  global.Cartao = { desenhar, FORMATOS };
})(window);
