/*
 * Desenha o "cartão" do resultado em PNG, no próprio navegador (canvas), para
 * compartilhar como imagem: Stories (1080x1920) ou Feed (1080x1080).
 *
 * Cartao.desenhar(spec, formato) -> Promise<Blob>
 *   spec = { kicker, destaque, frase, partes: [{ nome, detalhe, pct, frac }], sobra?, endereco }
 */
(function (global) {
  "use strict";

  const COR = { fundo: "#f6f5f1", cartao: "#ffffff", tinta: "#1d1f24", suave: "#5d6270", linha: "#e2e0d8", acento: "#0b6e4f", sobra: "#a9adb5" };
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

    // ---- barra e lista (eleitos e, se houver, a sobra em cinza) ----
    const partes = spec.partes || [];
    const sobra = spec.sobra;
    if (partes.length) {
      y += f.barra * 0.7;
      const fatias = partes.map((p, i) => ({ frac: p.frac, cor: corParte(i) }));
      if (sobra) fatias.push({ frac: sobra.frac, cor: COR.sobra });
      const gap = Math.max(4, Math.round(f.barra / 12));
      const util = largura - gap * (fatias.length - 1);
      ctx.save();
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(f.pad, y, largura, f.barra, f.barra * 0.22) : ctx.rect(f.pad, y, largura, f.barra);
      ctx.clip();
      let x = f.pad;
      for (const fa of fatias) {
        const w = Math.max(3, util * fa.frac);
        ctx.fillStyle = fa.cor;
        ctx.fillRect(x, y, w, f.barra);
        x += w + gap;
      }
      ctx.restore();
      y += f.barra + f.linha * 0.6;

      const quadrado = f.linha * 0.62;
      const linha = (p, cor) => {
        const base = y + f.linhaAlt * 0.62;
        ctx.fillStyle = cor;
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
      };

      // quantas linhas de eleitos cabem até o rodapé (a linha da sobra sempre aparece)
      const espaco = yRodape - f.linha * 0.8 - y - (sobra ? f.linhaAlt : 0);
      let n = Math.min(partes.length, f.maxLinhas, Math.floor(espaco / f.linhaAlt));
      if (partes.length > n) n = Math.max(0, Math.min(n, Math.floor((espaco - f.linhaAlt * 0.7) / f.linhaAlt)));
      for (let i = 0; i < n; i++) linha(partes[i], corParte(i));
      const resto = partes.length - n;
      if (resto > 0) {
        ctx.font = `400 ${Math.round(f.linha * 0.85)}px ${TEXTO}`;
        ctx.fillStyle = COR.suave;
        ctx.fillText(`e mais ${resto} ${resto === 1 ? "eleito" : "eleitos"}`, f.pad, y + f.linhaAlt * 0.6);
        y += f.linhaAlt * 0.8;
      }
      if (sobra) linha(sobra, COR.sobra);
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

    // ---- rodapé: faixa verde com o endereço em destaque (desenhada primeiro,
    // para saber quanto espaço sobra para o conteúdo) ----
    const tamUrl = Math.round(f.rodape * 1.3);
    const folga = Math.round(f.rodape * 0.85);
    // endereço em duas linhas: "chicocvenancio.github.io/" e "Para-onde-foi-o-seu-voto"
    const corte = spec.endereco.indexOf("/");
    const linhasUrl = corte > 0 ? [spec.endereco.slice(0, corte + 1), spec.endereco.slice(corte + 1)] : [spec.endereco];
    const altRodape = folga * 2 + f.rodape * 1.35 + tamUrl * 1.12 * linhasUrl.length;
    // Nos Stories, a barra de perfil (topo) e a caixa de resposta (base) cobrem ~250 px.
    const yRodape = f.h - f.padV - altRodape;
    ctx.fillStyle = COR.acento;
    retangulo(ctx, f.pad, yRodape, largura, altRodape, f.rodape * 0.6);
    const lado = Math.round(Math.min(altRodape - folga * 2, f.rodape * 3.4));
    let xTexto = f.pad + folga;
    if (img) {
      ctx.fillStyle = COR.fundo;
      retangulo(ctx, xTexto, yRodape + (altRodape - lado) / 2, lado, lado, lado * 0.2);
      const m = lado * 0.12;
      ctx.drawImage(img, xTexto + m, yRodape + (altRodape - lado) / 2 + m, lado - 2 * m, lado - 2 * m);
      xTexto += lado + folga;
    }
    const larguraTexto = f.pad + largura - folga - xTexto;
    let yT = yRodape + folga + f.rodape;
    ctx.fillStyle = "rgba(255,255,255,.82)";
    ctx.font = `600 ${f.rodape}px ${TEXTO}`;
    ctx.fillText(cortar(ctx, "Descubra para onde foi o seu voto:", larguraTexto), xTexto, yT);
    ctx.fillStyle = "#ffffff";
    ctx.font = `700 ${tamUrl}px ${TEXTO}`;
    yT += f.rodape * 0.35;
    for (const l of linhasUrl) { yT += tamUrl * 1.12; ctx.fillText(cortar(ctx, l, larguraTexto), xTexto, yT); }

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
