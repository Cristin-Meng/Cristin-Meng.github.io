// 孟子衡 · 个人介绍页

(function () {
  const yearEl = document.getElementById("year");
  if (yearEl) {
    yearEl.textContent = String(new Date().getFullYear());
  }

  // ---------- 左侧目录：滚动高亮 ----------
  const tocLinks = Array.prototype.slice.call(document.querySelectorAll(".toc-link[data-section]"));
  const sections = tocLinks
    .map(function (link) {
      const id = link.getAttribute("data-section");
      const el = document.getElementById(id);
      return el ? { id: id, el: el, link: link } : null;
    })
    .filter(Boolean);

  function setActive(id) {
    tocLinks.forEach(function (link) {
      const on = link.getAttribute("data-section") === id;
      link.classList.toggle("is-active", on);
      if (on) link.setAttribute("aria-current", "true");
      else link.removeAttribute("aria-current");
    });
  }

  function updateToc() {
    if (!sections.length) return;
    const marker = window.scrollY + Math.min(160, window.innerHeight * 0.22);
    let current = sections[0].id;
    for (let i = 0; i < sections.length; i += 1) {
      const top = sections[i].el.getBoundingClientRect().top + window.scrollY;
      if (top <= marker) current = sections[i].id;
    }
    // 滚到底时高亮最后一项
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
      current = sections[sections.length - 1].id;
    }
    setActive(current);
  }

  window.addEventListener("scroll", updateToc, { passive: true });
  window.addEventListener("resize", updateToc, { passive: true });
  updateToc();

  // 点击目录平滑滚动（尊重 reduced-motion）
  tocLinks.forEach(function (link) {
    link.addEventListener("click", function (e) {
      const id = link.getAttribute("data-section");
      const target = document.getElementById(id);
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      history.replaceState(null, "", "#" + id);
      setActive(id);
    });
  });

  // ---------- 章节进入视口轻微浮现 ----------
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!reduceMotion && "IntersectionObserver" in window) {
    const fadeSections = document.querySelectorAll(".section");
    fadeSections.forEach(function (el) {
      el.style.opacity = "0";
      el.style.transform = "translateY(10px)";
      el.style.transition = "opacity 0.55s ease, transform 0.55s ease";
    });

    const io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.style.opacity = "1";
            entry.target.style.transform = "none";
            entry.target.classList.add("is-inview");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );

    fadeSections.forEach(function (el) {
      io.observe(el);
    });
  } else {
    document.querySelectorAll(".section").forEach(function (el) {
      el.classList.add("is-inview");
    });
  }

  // 按钮轻微磁吸（仅细指针）
  if (!reduceMotion && window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
    document.querySelectorAll(".btn").forEach(function (btn) {
      btn.addEventListener("mousemove", function (e) {
        const r = btn.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        btn.style.transform = "translate(" + dx * 0.12 + "px," + (dy * 0.12 - 2) + "px)";
      });
      btn.addEventListener("mouseleave", function () {
        btn.style.transform = "";
      });
    });
  }

  // ---------- Hero 水波纹：高度场 + 底图折射 ----------
  (function initRipple() {
    const canvas = document.getElementById("ripple-canvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // 手机/触控：不做全画布折射（掉帧），只保留静态台阶 + 轻涟漪圆
    const LITE =
      window.matchMedia("(hover: none), (pointer: coarse)").matches ||
      Math.min(window.innerWidth, window.innerHeight) < 768;
    let cssW = 0;
    let cssH = 0;
    let dpr = 1;

    // 离屏：底图（波浪线 + 淡网格），再被水面折射采样
    let src = null;
    let srcCtx = null;
    let srcData = null;
    // putImageData 不吃 setTransform，高分屏会只画进左上角；先画到 CSS 分辨率画布再 drawImage
    let work = null;
    let workCtx = null;

    // 高度场（比屏幕粗，够折射用）
    let gw = 0;
    let gh = 0;
    let curr = null;
    let prev = null;
    const DAMP = 0.915;
    const CELL = 2;
    const REFR = 2.6;

    let needsRedrawSrc = true;
    let lastSpawn = 0;
    let waveT = 0;
    // 单振源：跟光标；短促发声，后段只衰减不再注入
    let emitter = null;
    const SOURCE_LIFE = 1050;
    const SOURCE_PERIOD = 22;
    const SOURCE_CUT = 0.55;

    function armEmitter(x, y, amp) {
      const now = performance.now();
      if (!emitter) {
        emitter = { x: x, y: y, amp: amp, t0: now, phase: 0 };
      } else {
        emitter.x = x;
        emitter.y = y;
        emitter.amp = Math.max(emitter.amp * 0.7, amp);
        emitter.t0 = now;
      }
    }

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.parentElement.getBoundingClientRect();
      cssW = Math.max(1, Math.round(rect.width));
      cssH = Math.max(1, Math.round(rect.height));
      canvas.width = Math.floor(cssW * dpr);
      canvas.height = Math.floor(cssH * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      gw = Math.max(8, Math.floor(cssW / CELL));
      gh = Math.max(8, Math.floor(cssH / CELL));
      curr = new Float32Array(gw * gh);
      prev = new Float32Array(gw * gh);

      if (!src) {
        src = document.createElement("canvas");
        srcCtx = src.getContext("2d", { willReadFrequently: true });
      }
      if (!work) {
        work = document.createElement("canvas");
        workCtx = work.getContext("2d");
      }
      src.width = cssW;
      src.height = cssH;
      work.width = cssW;
      work.height = cssH;
      needsRedrawSrc = true;
    }

    function paintSource() {
      if (!srcCtx) return;
      const c = srcCtx;
      c.clearRect(0, 0, cssW, cssH);

      // 波长拉长：在 1000 单位宽上排更少、更宽的台阶
      // 值沿用最初设计的 y 轨迹，x 加宽 → 不再密密麻麻
      const scaleX = cssW / 1000;
      const scaleY = cssH / 220;

      // 台阶顶点（水平段更宽）
      const steps = [
        [0, 160], [130, 160], [130, 120], [260, 120], [260, 140], [390, 140],
        [390, 80], [520, 80], [520, 110], [650, 110], [650, 60], [780, 60],
        [780, 100], [910, 100], [910, 70], [1000, 70],
      ];

      // 1) 台阶（墨蓝）
      c.beginPath();
      steps.forEach(function (p, i) {
        const x = p[0] * scaleX;
        const y = p[1] * scaleY;
        if (i === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      });
      c.strokeStyle = "rgba(44, 74, 110, 0.78)";
      c.lineWidth = 1.7;
      c.lineJoin = "miter";
      c.lineCap = "square";
      c.stroke();

      // 2) 连接台阶各点的光滑曲线（暖橙）
      // 取每段水平线段的中点作为型值点，Catmull-Rom 连成连续曲线
      const knots = [];
      for (let i = 0; i < steps.length - 1; i += 1) {
        const a = steps[i];
        const b = steps[i + 1];
        if (a[1] === b[1]) {
          // 水平段 → 中点
          knots.push([(a[0] + b[0]) / 2, a[1]]);
        }
      }
      if (knots.length >= 2) {
        const pts = knots.map(function (p) {
          return [p[0] * scaleX, p[1] * scaleY];
        });
        c.beginPath();
        c.moveTo(pts[0][0], pts[0][1]);
        for (let i = 0; i < pts.length - 1; i += 1) {
          const p0 = pts[i - 1] || pts[i];
          const p1 = pts[i];
          const p2 = pts[i + 1];
          const p3 = pts[i + 2] || pts[i + 1];
          // Catmull-Rom → 三次贝塞尔
          const c1x = p1[0] + (p2[0] - p0[0]) / 6;
          const c1y = p1[1] + (p2[1] - p0[1]) / 6;
          const c2x = p2[0] - (p3[0] - p1[0]) / 6;
          const c2y = p2[1] - (p3[1] - p1[1]) / 6;
          c.bezierCurveTo(c1x, c1y, c2x, c2y, p2[0], p2[1]);
        }
        c.strokeStyle = "rgba(196, 92, 38, 0.72)";
        c.lineWidth = 1.55;
        c.lineJoin = "round";
        c.lineCap = "round";
        c.stroke();
      }

      try {
        srcData = c.getImageData(0, 0, cssW, cssH);
      } catch (e) {
        srcData = null;
      }
      needsRedrawSrc = false;
    }

    function disturb(cx, cy, radiusCells, strength) {
      const gx = Math.floor(cx / CELL);
      const gy = Math.floor(cy / CELL);
      const r = radiusCells;
      for (let y = gy - r; y <= gy + r; y += 1) {
        if (y < 1 || y >= gh - 1) continue;
        for (let x = gx - r; x <= gx + r; x += 1) {
          if (x < 1 || x >= gw - 1) continue;
          const dx = x - gx;
          const dy = y - gy;
          const d2 = dx * dx + dy * dy;
          if (d2 > r * r) continue;
          // 高斯窝
          const fall = Math.exp(-d2 / (r * r * 0.35));
          curr[y * gw + x] += strength * fall;
        }
      }
    }

    function stepWave(now) {
      if (emitter) {
        const life = (now - emitter.t0) / SOURCE_LIFE;
        if (life >= 1) {
          emitter = null;
        } else if (life < SOURCE_CUT) {
          // 只在前段注入固定频率正弦；后段不注入，防止残响「越震越快」
          const decay = 1 - life / SOURCE_CUT;
          emitter.phase += (Math.PI * 2) / SOURCE_PERIOD;
          const inject = Math.sin(emitter.phase) * emitter.amp * decay;
          disturb(emitter.x, emitter.y, 2, inject);
        }
      }

      const damp = emitter ? DAMP : 0.88;
      for (let y = 1; y < gh - 1; y += 1) {
        const row = y * gw;
        for (let x = 1; x < gw - 1; x += 1) {
          const i = row + x;
          let v = (prev[i - 1] + prev[i + 1] + prev[i - gw] + prev[i + gw]) * 0.5 - curr[i];
          v *= damp;
          // 消掉数值残渣，避免肉眼看出「高频哆嗦」
          if (v < 0.004 && v > -0.004) v = 0;
          curr[i] = v;
        }
      }
      const t = prev;
      prev = curr;
      curr = t;
    }

    function render() {
      if (needsRedrawSrc) paintSource();
      if (!srcData || !workCtx) {
        ctx.clearRect(0, 0, cssW, cssH);
        if (src) ctx.drawImage(src, 0, 0, cssW, cssH);
        return;
      }

      const out = workCtx.createImageData(cssW, cssH);
      const srcPx = srcData.data;
      const outPx = out.data;
      // 用「前一帧」高度算梯度（prev 是最新波面）
      for (let y = 0; y < cssH; y += 1) {
        const gy = (y / CELL) | 0;
        const gy0 = gy > 0 ? gy - 1 : 0;
        const gy1 = gy < gh - 1 ? gy + 1 : gh - 1;
        for (let x = 0; x < cssW; x += 1) {
          const gx = (x / CELL) | 0;
          const gx0 = gx > 0 ? gx - 1 : 0;
          const gx1 = gx < gw - 1 ? gx + 1 : gw - 1;

          const hL = prev[gy * gw + gx0];
          const hR = prev[gy * gw + gx1];
          const hU = prev[gy0 * gw + gx];
          const hD = prev[gy1 * gw + gx];
          const dx = (hL - hR) * REFR * CELL;
          const dy = (hU - hD) * REFR * CELL;

          let sx = x + dx;
          let sy = y + dy;
          if (sx < 0) sx = 0;
          else if (sx > cssW - 1) sx = cssW - 1;
          if (sy < 0) sy = 0;
          else if (sy > cssH - 1) sy = cssH - 1;

          const si = ((sy | 0) * cssW + (sx | 0)) * 4;
          const oi = (y * cssW + x) * 4;
          outPx[oi] = srcPx[si];
          outPx[oi + 1] = srcPx[si + 1];
          outPx[oi + 2] = srcPx[si + 2];
          outPx[oi + 3] = srcPx[si + 3];
        }
      }
      workCtx.putImageData(out, 0, 0);
      // drawImage 会尊重 setTransform(dpr)，铺满整个 canvas
      ctx.clearRect(0, 0, cssW, cssH);
      ctx.drawImage(work, 0, 0, cssW, cssH);
    }

    function frame(now) {
      if (LITE) {
        // 轻量：静态底图 + 振源圆纹，不跑高度场
        if (needsRedrawSrc) paintSource();
        ctx.clearRect(0, 0, cssW, cssH);
        if (src) ctx.drawImage(src, 0, 0, cssW, cssH);
        if (emitter) {
          const life = (now - emitter.t0) / SOURCE_LIFE;
          if (life >= 1) {
            emitter = null;
          } else {
            const r = 18 + life * 90;
            const a = (1 - life) * 0.28;
            ctx.beginPath();
            ctx.arc(emitter.x, emitter.y, r, 0, Math.PI * 2);
            ctx.strokeStyle = "rgba(196, 92, 38, " + a + ")";
            ctx.lineWidth = 1.6;
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(emitter.x, emitter.y, r * 0.55, 0, Math.PI * 2);
            ctx.strokeStyle = "rgba(44, 74, 110, " + a * 0.5 + ")";
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        }
        requestAnimationFrame(frame);
        return;
      }
      stepWave(now || performance.now());
      render();
      requestAnimationFrame(frame);
    }

    function addDropFromEvent(clientX, clientY, strength) {
      const rect = canvas.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      if (x < -30 || x > cssW + 30 || y < -30 || y > cssH + 30) return;
      // 划过处成为波源：1.5s 内持续出波，振幅衰减
      armEmitter(x, y, 0.85 + strength * 1.4);
    }

    function onMove(e) {
      const now = performance.now();
      if (now - lastSpawn < 55) return;
      lastSpawn = now;
      const speed = Math.min(1, (Math.abs(e.movementX || 0) + Math.abs(e.movementY || 0)) / 28);
      addDropFromEvent(e.clientX, e.clientY, 0.35 + speed * 0.65);
    }

    resize();
    window.addEventListener("resize", resize);

    if (!reduce) {
      const host = canvas.parentElement;
      host.addEventListener("mousemove", onMove, { passive: true });
      host.addEventListener(
        "touchmove",
        function (e) {
          if (!e.touches[0]) return;
          const now = performance.now();
          if (now - lastSpawn < 90) return;
          lastSpawn = now;
          addDropFromEvent(e.touches[0].clientX, e.touches[0].clientY, 0.8);
        },
        { passive: true }
      );
      setTimeout(function () {
        armEmitter(cssW * 0.35, cssH * 0.55, 1.2);
      }, 200);
      setTimeout(function () {
        armEmitter(cssW * 0.62, cssH * 0.48, 1.0);
      }, 700);
      requestAnimationFrame(frame);
    } else {
      paintSource();
      ctx.drawImage(src, 0, 0, cssW, cssH);
    }
  })();

  // ---------- Hero 暖光跟随鼠标 ----------
  const hero = document.querySelector("body > .hero");
  const glow = document.getElementById("hero-glow");
  if (hero && glow && !reduceMotion && window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
    let gx = 0;
    let gy = 0;
    let tx = 0;
    let ty = 0;
    let glowRaf = 0;
    let glowing = false;

    function tickGlow() {
      glowRaf = 0;
      gx += (tx - gx) * 0.14;
      gy += (ty - gy) * 0.14;
      glow.style.transform = "translate3d(" + gx + "px," + gy + "px,0)";
      if (Math.abs(tx - gx) > 0.1 || Math.abs(ty - gy) > 0.1) {
        glowRaf = requestAnimationFrame(tickGlow);
      }
    }

    function ensureGlowTick() {
      if (!glowRaf) glowRaf = requestAnimationFrame(tickGlow);
    }

    function onWinMove(e) {
      const r = hero.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      const inside =
        e.clientX >= r.left &&
        e.clientX <= r.right &&
        e.clientY >= r.top &&
        e.clientY <= r.bottom;

      // 互斥：只有空白处保留暖光；文字（放大镜）和链接（可点态）把舞台让给光标
      const kind = inside ? hitMode(e.clientX, e.clientY) : "none";
      const allowGlow = inside && kind === "none";

      if (!allowGlow) {
        if (glowing) {
          glow.classList.remove("is-on");
          glowing = false;
        }
        return;
      }

      tx = x;
      ty = y;
      if (!glowing) {
        gx = x;
        gy = y;
        glow.classList.add("is-on");
        glowing = true;
        glow.style.transform = "translate3d(" + gx + "px," + gy + "px,0)";
      }
      ensureGlowTick();
    }

    window.addEventListener("mousemove", onWinMove, { passive: true });
    window.addEventListener(
      "scroll",
      function () {
        if (glowing) {
          glow.classList.remove("is-on");
          glowing = false;
        }
      },
      { passive: true }
    );
  }

  // ---------- 自定义光标：小圈高光 + 文字放大镜 ----------
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const dot = document.getElementById("cursor-dot");
  const lens = document.getElementById("cursor-lens");
  const stage = document.getElementById("lens-stage");

  if (!finePointer || !dot || !lens || !stage) {
    return;
  }

  document.body.classList.add("has-cursor");

  const ZOOM = 1.72;
  const LENS_R = 74;
  let lensBuilt = false;
  let mode = "dot"; // 'dot' | 'lens' | 'link'
  let mouseX = window.innerWidth / 2;
  let mouseY = window.innerHeight / 2;
  let raf = 0;

  function stripIds(root) {
    if (!root) return;
    if (root.removeAttribute && root.id) root.removeAttribute("id");
    const all = root.querySelectorAll ? root.querySelectorAll("[id]") : [];
    for (let i = 0; i < all.length; i += 1) {
      all[i].removeAttribute("id");
    }
  }

  function buildLens() {
    if (lensBuilt) return;
    const hero = document.querySelector("body > .hero");
    // 必须克隆整个 shell（含左侧目录 + 正文），文档 Y 坐标才与原页一致
    const shell = document.querySelector("body > .shell");
    stage.innerHTML = "";

    const pageWidth = document.documentElement.clientWidth;
    stage.style.width = pageWidth + "px";

    if (hero) {
      const heroClone = hero.cloneNode(true);
      stripIds(heroClone);
      stage.appendChild(heroClone);
    }
    if (shell) {
      const shellClone = shell.cloneNode(true);
      stripIds(shellClone);
      shellClone.querySelectorAll(".section").forEach(function (el) {
        el.style.opacity = "1";
        el.style.transform = "none";
        el.style.transition = "none";
      });
      stage.appendChild(shellClone);
    }
    lensBuilt = true;
    refreshTextNodes();
  }

  function hitTestText(el, x, y) {
    try {
      const range = document.createRange();
      range.selectNodeContents(el);
      const rects = range.getClientRects();
      for (let i = 0; i < rects.length; i += 1) {
        const r = rects[i];
        if (r.width < 1 || r.height < 1) continue;
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return true;
      }
    } catch (_) {
      /* ignore */
    }
    return false;
  }

  function hitTestBox(el, x, y) {
    const r = el.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }

  const TEXT_SELECTOR =
    "h1,h2,h3,h4,p,li,em,strong,span.mono,.tagline,.label,.card-tag,.project-meta,.link-label,.sec-label,.chips li,.btn,.name,.toc-text,.pending";
  const INTERACTIVE_SELECTOR =
    "a[href], a[target], button, [role='link'], [role='button'], [onclick]";

  let textNodes = [];
  let interactiveNodes = [];

  function refreshTextNodes() {
    const excluded = function (el) {
      return !!(el.closest && el.closest(".cursor-fx, #lens-stage, .hero-canvas"));
    };
    textNodes = Array.prototype.slice
      .call(document.querySelectorAll(TEXT_SELECTOR))
      .filter(function (el) {
        return !excluded(el);
      });
    interactiveNodes = Array.prototype.slice
      .call(document.querySelectorAll(INTERACTIVE_SELECTOR))
      .filter(function (el) {
        return !excluded(el);
      });
  }
  refreshTextNodes();
  window.addEventListener("resize", refreshTextNodes, { passive: true });

  /** 'link' | 'text' | 'none' */
  function hitMode(x, y) {
    for (let i = 0; i < interactiveNodes.length; i += 1) {
      const el = interactiveNodes[i];
      if (hitTestText(el, x, y) || hitTestBox(el, x, y)) return "link";
    }
    for (let i = 0; i < textNodes.length; i += 1) {
      const el = textNodes[i];
      if ((el.textContent || "").trim().length === 0) continue;
      if (hitTestText(el, x, y)) return "text";
    }
    return "none";
  }

  function setMode(next) {
    if (next === mode) return;
    mode = next;
    if (next === "lens") {
      buildLens();
      lens.classList.add("is-active", "is-on");
      dot.classList.add("is-hidden");
      dot.classList.remove("is-link");
    } else {
      lens.classList.remove("is-active");
      dot.classList.remove("is-hidden");
      if (next === "link") {
        dot.classList.add("is-link");
      } else {
        dot.classList.remove("is-link");
      }
    }
    schedulePlace();
  }

  function place() {
    raf = 0;
    dot.style.left = mouseX + "px";
    dot.style.top = mouseY + "px";
    lens.style.left = mouseX + "px";
    lens.style.top = mouseY + "px";

    if (mode === "lens" && lensBuilt) {
      const docX = mouseX + window.scrollX;
      const docY = mouseY + window.scrollY;
      const left = LENS_R - docX * ZOOM;
      const top = LENS_R - docY * ZOOM;
      stage.style.left = left + "px";
      stage.style.top = top + "px";
      stage.style.transform = "scale(" + ZOOM + ")";
    }
  }

  function schedulePlace() {
    if (!raf) raf = requestAnimationFrame(place);
  }

  function onMove(e) {
    mouseX = e.clientX;
    mouseY = e.clientY;
    dot.classList.add("is-on");
    lens.classList.add("is-on");
    const kind = hitMode(e.clientX, e.clientY);
    if (kind === "text") setMode("lens");
    else if (kind === "link") setMode("link");
    else setMode("dot");
    schedulePlace();
  }

  function onLeave() {
    dot.classList.remove("is-on");
    lens.classList.remove("is-on", "is-active");
  }

  window.addEventListener("mousemove", onMove, { passive: true });
  document.addEventListener("mouseleave", onLeave);
  window.addEventListener(
    "scroll",
    function () {
      if (mode === "lens") schedulePlace();
    },
    { passive: true }
  );
  window.addEventListener("resize", schedulePlace, { passive: true });

  schedulePlace();
})();
