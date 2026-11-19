// Código JavaScript do app Giro Foco publicado no Google Sites (gerado no Google AI Studio/Gemini).
// Extraído em 19/11/2026 do incorporado do site. EMBEDDED_DEFAULT_STATE foi esvaziado aqui de propósito:
// no site original ele contém a senha de admin e os dados de todos os clientes.


    // =========================================================================
    // 1. ARQUITETURA SEPARADA: DADOS COMPARTILHADOS NA NUVEM vs SESSÃO PRIVADA
    //    Garante 100% que quando um vendedor abrir no celular dele, NUNCA
    //    apareça a carteira ou login de outro celular!
    // =========================================================================
    const CLOUD_DATA_STORAGE_KEY = "giro_cda_shared_data_v4";
    const DEVICE_SESSION_KEY = "giro_cda_private_session_v4";

    /*__EMBEDDED_STATE_START__*/
    const EMBEDDED_DEFAULT_STATE = {} /* REMOVIDO: continha senha de admin e dados de clientes */;
    /*__EMBEDDED_STATE_END__*/

    let state = {
      // Sessão estritamente privada deste aparelho (NUNCA vai para a nuvem nem para o HTML exportado!)
      loggedIn: false,
      role: "VENDEDOR",
      activeSupId: "",
      activeSetorId: "",
      adminUnlocked: false,
      soundEnabled: true,
      listMode: "cards",
      activeTab: "carteira",

      // Dados compartilhados da operação (Sincronizados na nuvem Google / Canva DataSDK)
      adminPass: EMBEDDED_DEFAULT_STATE.adminPass || "0026",
      sellerPassMode: EMBEDDED_DEFAULT_STATE.sellerPassMode || "SAME_AS_SETOR",
      sellerKeyword: EMBEDDED_DEFAULT_STATE.sellerKeyword || "",
      supPassMode: EMBEDDED_DEFAULT_STATE.supPassMode || "SAME_AS_MESA",
      supKeyword: EMBEDDED_DEFAULT_STATE.supKeyword || "",
      calcMetricMode: EMBEDDED_DEFAULT_STATE.calcMetricMode || "ATIVOS",
      boxFactorHL: EMBEDDED_DEFAULT_STATE.boxFactorHL || 0.0396,
      lastUpdateLabel: EMBEDDED_DEFAULT_STATE.lastUpdateLabel || "Aguardando atualização da planilha",
      lastUpdateDateISO: EMBEDDED_DEFAULT_STATE.lastUpdateDateISO || "",
      cloudWebhookUrl: EMBEDDED_DEFAULT_STATE.cloudWebhookUrl || "",
      clients: Array.isArray(EMBEDDED_DEFAULT_STATE.clients) ? JSON.parse(JSON.stringify(EMBEDDED_DEFAULT_STATE.clients)) : [],
      dailySnapshots: Array.isArray(EMBEDDED_DEFAULT_STATE.dailySnapshots) ? JSON.parse(JSON.stringify(EMBEDDED_DEFAULT_STATE.dailySnapshots)) : [],
      alerts: Array.isArray(EMBEDDED_DEFAULT_STATE.alerts) ? JSON.parse(JSON.stringify(EMBEDDED_DEFAULT_STATE.alerts)) : [],
      pendingPasteRows: []
    };

    let chartDonutInstance = null;
    let chartMesasInstance = null;
    let chartMonthlyTrendInstance = null;

    // =========================================================================
    // 2. PERSISTÊNCIA PRIVADA DE SESSÃO + SINCRONIZAÇÃO EM NUVEM (GOOGLE SCRIPT)
    // =========================================================================
    function getSharedCloudPayload() {
      return {
        adminPass: state.adminPass,
        sellerPassMode: state.sellerPassMode,
        sellerKeyword: state.sellerKeyword,
        supPassMode: state.supPassMode,
        supKeyword: state.supKeyword,
        calcMetricMode: state.calcMetricMode,
        boxFactorHL: state.boxFactorHL,
        lastUpdateLabel: state.lastUpdateLabel,
        lastUpdateDateISO: state.lastUpdateDateISO,
        cloudWebhookUrl: state.cloudWebhookUrl,
        clients: state.clients,
        dailySnapshots: state.dailySnapshots,
        alerts: state.alerts
      };
    }

    function loadSavedState() {
      // 1. Carrega os dados da base
      try {
        const rawData = localStorage.getItem(CLOUD_DATA_STORAGE_KEY);
        if (rawData) {
          const parsedData = JSON.parse(rawData);
          if (parsedData && typeof parsedData === "object") {
            // Nunca sobrescreve role/activeSetorId/activeSupId a partir da nuvem!
            delete parsedData.role;
            delete parsedData.activeSetorId;
            delete parsedData.activeSupId;
            delete parsedData.adminUnlocked;
            state = Object.assign({}, state, parsedData);
            if (!state.adminPass) state.adminPass = EMBEDDED_DEFAULT_STATE.adminPass || "0026";
            if (!Array.isArray(state.dailySnapshots)) state.dailySnapshots = [];
          }
        }
      } catch (e) {
        console.warn("Data storage fallback:", e);
      }

      // 2. Carrega a sessão privada exclusiva deste navegador/celular
      try {
        const rawSession = sessionStorage.getItem(DEVICE_SESSION_KEY);
        if (rawSession) {
          const sess = JSON.parse(rawSession);
          if (sess && sess.loggedIn) {
            state.loggedIn = true;
            state.role = sess.role || "VENDEDOR";
            state.activeSetorId = sess.activeSetorId || "";
            state.activeSupId = sess.activeSupId || "";
            state.adminUnlocked = Boolean(sess.adminUnlocked);
          }
        }
      } catch (e) {}
    }

    function savePrivateSession() {
      try {
        sessionStorage.setItem(DEVICE_SESSION_KEY, JSON.stringify({
          loggedIn: state.loggedIn,
          role: state.role,
          activeSetorId: state.activeSetorId,
          activeSupId: state.activeSupId,
          adminUnlocked: state.adminUnlocked
        }));
      } catch (e) {}
    }

    function saveState(syncToCloud = true) {
      const sharedPayload = getSharedCloudPayload();
      try {
        localStorage.setItem(CLOUD_DATA_STORAGE_KEY, JSON.stringify(sharedPayload));
      } catch (e) {
        console.warn("Save storage ignore:", e);
      }
      savePrivateSession();

      // Suporte nativo ao Canva DataSDK se estiver rodando dentro do Canva
      try {
        if (window.dataSdk && typeof window.dataSdk.set === "function") {
          window.dataSdk.set("giro_cda_cloud_state", sharedPayload);
        }
      } catch (e) {}

      if (syncToCloud) {
        pushStateToGoogleCloud();
      }
    }

    async function pushStateToGoogleCloud() {
      const url = (state.cloudWebhookUrl || "").trim();
      if (!url) return;
      updateCloudBadge("Sincronizando Nuvem...", "amber");
      try {
        const payload = getSharedCloudPayload();
        await fetch(url, {
          method: "POST",
          mode: "no-cors",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify(payload)
        });
        updateCloudBadge("Nuvem Sincronizada ✓", "emerald");
      } catch (e) {
        console.warn("Cloud push warning:", e);
        updateCloudBadge("Salvo no Aparelho", "amber");
      }
    }

    async function pullStateFromGoogleCloud(showFeedback = false) {
      const url = (state.cloudWebhookUrl || "").trim();
      if (!url) {
        if (showFeedback) {
          showToast("Configure a URL da Nuvem Google na aba 'Nuvem Google (100% Grátis)' primeiro!", "warning");
        }
        return;
      }
      updateCloudBadge("Buscando Nuvem...", "amber");
      try {
        const res = await fetch(url + (url.includes("?") ? "&" : "?") + "t=" + Date.now(), {
          method: "GET"
        });
        if (res.ok) {
          const cloudData = await res.json();
          if (cloudData && Array.isArray(cloudData.clients)) {
            // Preserva a sessão privada deste celular!
            const currentSession = {
              loggedIn: state.loggedIn,
              role: state.role,
              activeSetorId: state.activeSetorId,
              activeSupId: state.activeSupId,
              adminUnlocked: state.adminUnlocked
            };
            delete cloudData.role;
            delete cloudData.activeSetorId;
            delete cloudData.activeSupId;
            delete cloudData.adminUnlocked;

            state = Object.assign({}, state, cloudData, currentSession);
            saveState(false);
            syncFilterDropdownsWithRole();
            renderAll();
            updateCloudBadge("Nuvem Online ✓", "emerald");
            if (showFeedback) {
              showToast(`Base sincronizada da nuvem! (${state.clients.length} registros)`, "success");
            }
            return;
          }
        }
        updateCloudBadge("Nuvem Conectada", "emerald");
      } catch (e) {
        console.warn("Cloud pull skipped:", e);
        updateCloudBadge("Modo Local Ativo", "amber");
        if (showFeedback) {
          showToast("Não foi possível ler da URL informada. Verifique se publicou o Google Script como 'Qualquer pessoa'.", "warning");
        }
      }
    }

    function manualCloudPull() {
      pullStateFromGoogleCloud(true);
    }

    function updateCloudBadge(text, color = "emerald") {
      const badge = document.getElementById("cloudStatusBadge");
      const badgeText = document.getElementById("cloudStatusBadgeText");
      if (!badge || !badgeText) return;
      badgeText.textContent = text;
      badge.className = color === "emerald"
        ? "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-200 border border-emerald-400/30"
        : "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-200 border border-amber-400/30";
    }

    // Regra de Expurgo: Verifica se o cliente está expurgado (SIM, S, EXPURGADO, 1, TRUE)
    function isClientExpurgado(c) {
      const val = String(c.expurgado || "NAO").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
      return val === "SIM" || val === "S" || val === "EXPURGADO" || val === "TRUE" || val === "1";
    }

    function getDynamicSupervisores() {
      const map = new Map();
      state.clients.forEach(c => {
        const id = String(c.supId || "").trim();
        if (id && !map.has(id)) {
          map.set(id, { id, nome: c.supNome || `Mesa ${id}` });
        }
      });
      return Array.from(map.values()).sort((a, b) => a.id.localeCompare(b.id));
    }

    function getDynamicSetores(filterSupId = "ALL") {
      const map = new Map();
      state.clients.forEach(c => {
        const id = String(c.setorId || "").trim();
        const supId = String(c.supId || "").trim();
        if (filterSupId !== "ALL" && supId !== String(filterSupId)) return;
        if (id && !map.has(id)) {
          map.set(id, { id, nome: c.vendedorNome || `Setor ${id}`, supId });
        }
      });
      return Array.from(map.values()).sort((a, b) => a.id.localeCompare(b.id));
    }

    // =========================================================================
    // 3. WEB AUDIO API — APITO SONORO PARA NOTIFICAÇÕES
    // =========================================================================
    let audioCtx = null;
    function playBeepSound(kind = "yellow") {
      if (!state.soundEnabled) return;
      try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;
        if (!audioCtx) audioCtx = new AudioContextClass();
        if (audioCtx.state === "suspended") audioCtx.resume();

        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);

        if (kind === "confirm") {
          osc.type = "triangle";
          osc.frequency.setValueAtTime(587.33, now);
          osc.frequency.setValueAtTime(880.0, now + 0.12);
          gain.gain.setValueAtTime(0.18, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
          osc.start(now);
          osc.stop(now + 0.36);
        } else {
          osc.type = "sine";
          osc.frequency.setValueAtTime(659.25, now);
          osc.frequency.setValueAtTime(783.99, now + 0.09);
          gain.gain.setValueAtTime(0.16, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
          osc.start(now);
          osc.stop(now + 0.26);
        }

        const bell = document.getElementById("bellIcon");
        if (bell) {
          bell.classList.remove("bell-animate");
          void bell.offsetWidth;
          bell.classList.add("bell-animate");
        }
      } catch (err) {
        console.warn("Audio warning:", err);
      }
    }

    function toggleSoundAlert() {
      state.soundEnabled = !state.soundEnabled;
      saveState(false);
      updateHeaderControls();
      if (state.soundEnabled) {
        playBeepSound("yellow");
        showToast("Som de apito ativado!", "success");
      } else {
        showToast("Som de apito silenciado.", "info");
      }
    }

    // =========================================================================
    // 4. CÁLCULO DE META HL, CAIXAS FALTANTES E MODO DE PERCENTUAL
    // =========================================================================
    function calcClientMetrics(c) {
      const real = parseFloat(c.realHL) || 0;
      const meta = parseFloat(c.metaHL) || 0;
      const faltaHL = Math.max(0, +(meta - real).toFixed(4));
      const factor = parseFloat(state.boxFactorHL) || 0.0396;
      const faltaCaixas = faltaHL > 0 ? Math.ceil(faltaHL / factor) : 0;
      const calcRetorno = meta > 0 ? Math.round((real / meta) * 100) : (c.retornoPct || 0);
      return { real, meta, faltaHL, faltaCaixas, calcRetorno };
    }

    function formatBR(num, decimals = 2) {
      return Number(num || 0).toLocaleString("pt-BR", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
      });
    }

    function changeBoxFactor(val) {
      const num = parseFloat(val);
      if (!num || num <= 0) return;
      state.boxFactorHL = num;
      const s1 = document.getElementById("selectBoxFactor");
      const s2 = document.getElementById("selectBoxFactorMobile");
      if (s1) s1.value = String(val);
      if (s2) s2.value = String(val);
      saveState(false);
      renderAll();
      showToast(`Conversão atualizada para ${formatBR(num, 4)} HL por caixa!`, "info");
    }

    function changeCalcMetricMode(mode) {
      state.calcMetricMode = mode === "CLIENTES" ? "CLIENTES" : "ATIVOS";
      const s1 = document.getElementById("selectCalcMetricMode");
      const s2 = document.getElementById("selectCalcMetricModeMobile");
      const s3 = document.getElementById("adminSelectCalcMetric");
      if (s1) s1.value = state.calcMetricMode;
      if (s2) s2.value = state.calcMetricMode;
      if (s3) s3.value = state.calcMetricMode;
      saveState(false);
      renderAll();
      showToast(
        state.calcMetricMode === "ATIVOS"
          ? "Percentuais calculados sobre o Total de Ativos em Campo (Padrão Planilha)!"
          : "Percentuais calculados sobre a Quantidade de Clientes!",
        "info"
      );
    }

    // =========================================================================
    // 5. ISOLAMENTO ESTRITO DE CARTEIRA POR APARELHO (PRIVACIDADE DE VENDEDOR)
    // =========================================================================
    function getScopedClients() {
      // Se ainda não fez login neste aparelho, não mostra clientes de ninguém!
      if (!state.loggedIn) return [];
      return state.clients.filter(c => {
        if (state.role === "VENDEDOR") {
          return String(c.setorId).trim() === String(state.activeSetorId).trim();
        }
        if (state.role === "SUPERVISOR") {
          return String(c.supId).trim() === String(state.activeSupId).trim();
        }
        return true; // ADMIN vê todas as mesas
      });
    }

    function getScopedAlerts() {
      if (!state.loggedIn) return [];
      return state.alerts.filter(a => {
        if (state.role === "ADMIN") return true;
        if (!a.clientId) return true;
        const c = state.clients.find(cli => String(cli.idCliente) === String(a.clientId));
        if (!c) return false;
        if (state.role === "VENDEDOR") return String(c.setorId).trim() === String(state.activeSetorId).trim();
        if (state.role === "SUPERVISOR") return String(c.supId).trim() === String(state.activeSupId).trim();
        return false;
      });
    }

    function onEntryRoleChange() {
      const role = document.getElementById("entrySelectRole").value;
      const vendGroup = document.getElementById("entryVendedorGroup");
      const supGroup = document.getElementById("entrySupervisorGroup");
      const admGroup = document.getElementById("entryAdminGroup");
      const errBox = document.getElementById("entryErrorMsg");
      const btnLabel = document.getElementById("btnEntrySubmitLabel");
      if (errBox) errBox.classList.add("hidden");

      if (role === "VENDEDOR") {
        vendGroup.classList.remove("hidden");
        supGroup.classList.add("hidden");
        admGroup.classList.add("hidden");
        btnLabel.textContent = "Entrar";
      } else if (role === "SUPERVISOR") {
        vendGroup.classList.add("hidden");
        supGroup.classList.remove("hidden");
        admGroup.classList.add("hidden");
        btnLabel.textContent = "Entrar";
      } else {
        vendGroup.classList.add("hidden");
        supGroup.classList.add("hidden");
        admGroup.classList.remove("hidden");
        btnLabel.textContent = "Entrar como Administrador";
      }
      if (window.lucide) lucide.createIcons();
    }

    function openRoleModal() {
      const roleSel = document.getElementById("entrySelectRole");
      if (roleSel) {
        roleSel.value = state.loggedIn ? state.role : "VENDEDOR";
      }
      // Nunca pré-preenche o setor de outra pessoa se não estiver logado neste aparelho
      document.getElementById("entryInputSetor").value = state.loggedIn ? (state.activeSetorId || "") : "";
      document.getElementById("entryInputSellerPass").value = "";
      document.getElementById("entryInputMesa").value = state.loggedIn ? (state.activeSupId || "") : "";
      document.getElementById("entryInputSupPass").value = "";
      document.getElementById("entryInputAdminPass").value = "";

      const closeBtn = document.getElementById("btnCloseRoleModal");
      if (closeBtn) {
        if (state.loggedIn) closeBtn.classList.remove("hidden");
        else closeBtn.classList.add("hidden");
      }

      const modalUpdateInfo = document.getElementById("modalLastUpdateInfo");
      if (modalUpdateInfo) {
        modalUpdateInfo.textContent = `Última atualização: ${state.lastUpdateLabel}`;
      }

      onEntryRoleChange();
      document.getElementById("modalRoleSelector").classList.remove("hidden");
    }

    function closeRoleModal() {
      if (!state.loggedIn) return; // Obriga identificar Setor, Mesa ou Admin antes de ver dados
      document.getElementById("modalRoleSelector").classList.add("hidden");
    }

    function showEntryError(msg) {
      const errBox = document.getElementById("entryErrorMsg");
      errBox.textContent = msg;
      errBox.classList.remove("hidden");
    }

    function confirmRoleEntry() {
      const role = document.getElementById("entrySelectRole").value;
      const errBox = document.getElementById("entryErrorMsg");
      errBox.classList.add("hidden");

      if (role === "VENDEDOR") {
        const setorTyped = (document.getElementById("entryInputSetor").value || "").trim();
        const passTyped = (document.getElementById("entryInputSellerPass").value || "").trim();

        if (!setorTyped || !passTyped) {
          showEntryError("Preencha o Setor e a Senha.");
          return;
        }

        if (state.sellerPassMode === "SAME_AS_SETOR") {
          if (passTyped !== setorTyped) {
            showEntryError("Credenciais inválidas.");
            return;
          }
        } else {
          if (passTyped !== state.sellerKeyword) {
            showEntryError("Credenciais inválidas.");
            return;
          }
        }

        state.loggedIn = true;
        state.adminUnlocked = false;
        state.role = "VENDEDOR";
        state.activeSetorId = setorTyped;
        const foundClient = state.clients.find(c => String(c.setorId).trim() === setorTyped);
        state.activeSupId = foundClient ? String(foundClient.supId).trim() : "";

        savePrivateSession();
        closeRoleModal();
        syncFilterDropdownsWithRole();
        switchMainTab("carteira");
        renderAll();
        showToast(`Setor ${setorTyped} conectado! Exibindo exclusivamente sua carteira.`, "success");
        return;
      }

      if (role === "SUPERVISOR") {
        const mesaTyped = (document.getElementById("entryInputMesa").value || "").trim();
        const passTyped = (document.getElementById("entryInputSupPass").value || "").trim();

        if (!mesaTyped || !passTyped) {
          showEntryError("Preencha a Mesa e a Senha.");
          return;
        }

        if (state.supPassMode === "SAME_AS_MESA") {
          if (passTyped !== mesaTyped) {
            showEntryError("Credenciais inválidas.");
            return;
          }
        } else {
          if (passTyped !== state.supKeyword) {
            showEntryError("Credenciais inválidas.");
            return;
          }
        }

        state.loggedIn = true;
        state.adminUnlocked = false;
        state.role = "SUPERVISOR";
        state.activeSupId = mesaTyped;
        state.activeSetorId = "";

        savePrivateSession();
        closeRoleModal();
        syncFilterDropdownsWithRole();
        switchMainTab("carteira");
        renderAll();
        showToast(`Mesa ${mesaTyped} conectada!`, "success");
        return;
      }

      if (role === "ADMIN") {
        const typed = (document.getElementById("entryInputAdminPass").value || "").trim();
        if (!typed) {
          showEntryError("Digite a senha de Administrador.");
          return;
        }
        const validPass = state.adminPass || "0026";
        if (typed !== validPass) {
          showEntryError("Senha de Administrador incorreta.");
          return;
        }
        state.loggedIn = true;
        state.adminUnlocked = true;
        state.role = "ADMIN";
        savePrivateSession();
        closeRoleModal();
        syncAdminFormControls();
        syncFilterDropdownsWithRole();
        switchMainTab(window._pendingAdminTargetTab || "admin");
        window._pendingAdminTargetTab = null;
        renderAll();
        showToast("Acesso de Administrador liberado!", "success");
      }
    }

    function handleAdminGearClick(targetTab = "admin") {
      if (state.loggedIn && state.role === "ADMIN" && state.adminUnlocked) {
        syncAdminFormControls();
        switchMainTab(targetTab);
      } else {
        window._pendingAdminTargetTab = targetTab;
        openRoleModal();
        document.getElementById("entrySelectRole").value = "ADMIN";
        onEntryRoleChange();
      }
    }

    function lockAdminSession() {
      state.loggedIn = false;
      state.adminUnlocked = false;
      state.role = "VENDEDOR";
      state.activeSetorId = "";
      state.activeSupId = "";
      savePrivateSession();
      switchMainTab("carteira");
      openRoleModal();
      renderAll();
      showToast("Sessão encerrada neste aparelho.", "info");
    }

    function toggleAdminPassKeywordInputs() {
      const sellerMode = document.getElementById("adminSelectSellerPassMode").value;
      const supMode = document.getElementById("adminSelectSupPassMode").value;
      const sellerBox = document.getElementById("adminSellerKeywordBox");
      const supBox = document.getElementById("adminSupKeywordBox");

      if (sellerMode === "CUSTOM_KEYWORD") sellerBox.classList.remove("hidden");
      else sellerBox.classList.add("hidden");

      if (supMode === "CUSTOM_KEYWORD") supBox.classList.remove("hidden");
      else supBox.classList.add("hidden");
    }

    function syncAdminFormControls() {
      const sMode = document.getElementById("adminSelectSellerPassMode");
      const sKey = document.getElementById("adminInputSellerKeyword");
      const pMode = document.getElementById("adminSelectSupPassMode");
      const pKey = document.getElementById("adminInputSupKeyword");
      const aPass = document.getElementById("adminInputPassword");
      const cMet = document.getElementById("adminSelectCalcMetric");
      const cUrl = document.getElementById("inputCloudWebhookUrl");

      if (sMode) sMode.value = state.sellerPassMode || "SAME_AS_SETOR";
      if (sKey) sKey.value = state.sellerKeyword || "";
      if (pMode) pMode.value = state.supPassMode || "SAME_AS_MESA";
      if (pKey) pKey.value = state.supKeyword || "";
      if (aPass) aPass.value = state.adminPass || "0026";
      if (cMet) cMet.value = state.calcMetricMode || "ATIVOS";
      if (cUrl) cUrl.value = state.cloudWebhookUrl || "";
      toggleAdminPassKeywordInputs();
    }

    function saveAdminSettings() {
      const sellerMode = document.getElementById("adminSelectSellerPassMode").value;
      const sellerKw = (document.getElementById("adminInputSellerKeyword").value || "").trim();
      const supMode = document.getElementById("adminSelectSupPassMode").value;
      const supKw = (document.getElementById("adminInputSupKeyword").value || "").trim();
      const newAdminPass = (document.getElementById("adminInputPassword").value || "").trim();
      const calcMet = document.getElementById("adminSelectCalcMetric").value;

      if (sellerMode === "CUSTOM_KEYWORD" && !sellerKw) {
        showToast("Informe a palavra-chave para os Vendedores!", "warning");
        return;
      }
      if (supMode === "CUSTOM_KEYWORD" && !supKw) {
        showToast("Informe a palavra-chave para os Supervisores!", "warning");
        return;
      }
      if (!newAdminPass) {
        showToast("A senha de Administrador não pode ficar vazia!", "warning");
        return;
      }

      state.sellerPassMode = sellerMode;
      state.sellerKeyword = sellerKw;
      state.supPassMode = supMode;
      state.supKeyword = supKw;
      state.adminPass = newAdminPass;
      state.calcMetricMode = calcMet;

      const s1 = document.getElementById("selectCalcMetricMode");
      const s2 = document.getElementById("selectCalcMetricModeMobile");
      if (s1) s1.value = calcMet;
      if (s2) s2.value = calcMet;

      saveState(true);
      renderAll();
      showToast("Senhas e configurações salvas e enviadas para a Nuvem!", "success");
    }

    // =========================================================================
    // 6. FILTROS COMBINÁVEIS E SINCRONIZAÇÃO DE CABEÇALHO
    // =========================================================================
    function syncFilterDropdownsWithRole() {
      const supSelect = document.getElementById("filterSupervisor");
      const vendSelect = document.getElementById("filterVendedor");
      const catSelect = document.getElementById("filterCategoria");

      const sups = getDynamicSupervisores();

      if (state.role === "VENDEDOR") {
        // Vendedor enxerga estritamente o seu próprio setor nos filtros
        supSelect.innerHTML = `<option value="${state.activeSupId || 'ALL'}">${state.activeSupId ? 'Mesa ' + state.activeSupId : 'Minha Mesa'}</option>`;
        supSelect.disabled = true;
        vendSelect.innerHTML = `<option value="${state.activeSetorId}">Setor ${state.activeSetorId}</option>`;
        vendSelect.disabled = true;
      } else if (state.role === "SUPERVISOR") {
        supSelect.innerHTML = `<option value="${state.activeSupId}">Mesa ${state.activeSupId}</option>`;
        supSelect.disabled = true;
        const list = getDynamicSetores(state.activeSupId);
        vendSelect.innerHTML = `<option value="ALL">Todos os Setores da Minha Mesa (${list.length})</option>` +
          list.map(st => `<option value="${st.id}">Setor ${st.id} — ${st.nome}</option>`).join("");
        vendSelect.disabled = false;
      } else {
        supSelect.innerHTML = `<option value="ALL">Todas as Mesas (${sups.length})</option>` +
          sups.map(s => `<option value="${s.id}">Mesa ${s.id} — ${s.nome}</option>`).join("");
        supSelect.disabled = false;
        populateVendedorFilterDropdown();
      }

      const scoped = getScopedClients();
      const cats = Array.from(new Set(scoped.map(c => c.categoria).filter(Boolean))).sort();
      const currentCat = catSelect.value || "ALL";
      catSelect.innerHTML = `<option value="ALL">Categoria: Todas</option>` +
        cats.map(cat => `<option value="${cat}">${cat}</option>`).join("");
      if (cats.includes(currentCat)) catSelect.value = currentCat;
    }

    function populateVendedorFilterDropdown() {
      if (state.role === "VENDEDOR") return;
      const supVal = document.getElementById("filterSupervisor").value;
      const vendSelect = document.getElementById("filterVendedor");
      const list = getDynamicSetores(supVal);

      vendSelect.innerHTML = `<option value="ALL">Todos os Setores (${list.length})</option>` +
        list.map(st => `<option value="${st.id}">Setor ${st.id}</option>`).join("");
      vendSelect.value = "ALL";
      vendSelect.disabled = false;
    }

    function onFilterSupervisorChange() {
      populateVendedorFilterDropdown();
      applyFilters();
    }

    function getFilteredClients() {
      const base = getScopedClients();
      const q = (document.getElementById("filterSearch")?.value || "").trim().toLowerCase();
      const sup = document.getElementById("filterSupervisor")?.value || "ALL";
      const vend = document.getElementById("filterVendedor")?.value || "ALL";
      const status = document.getElementById("filterStatusGiro")?.value || "ALL";
      const marc = document.getElementById("filterMarcacao")?.value || "ALL";
      const cat = document.getElementById("filterCategoria")?.value || "ALL";
      const mat = document.getElementById("filterMatriz")?.value || "ALL";
      const exp = document.getElementById("filterExpurgado")?.value || "NAO";
      const sortBy = document.getElementById("filterSort")?.value || "PRIORIDADE";

      let result = base.filter(c => {
        const isExp = isClientExpurgado(c);
        if (exp === "NAO" && isExp) return false;
        if (exp === "SIM" && !isExp) return false;

        if (q) {
          const hay = `${c.idCliente} ${c.cliente} ${c.cnpj} ${c.vendedorNome} ${c.setorId}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        if (state.role === "ADMIN" && sup !== "ALL" && String(c.supId) !== String(sup)) return false;
        if (state.role !== "VENDEDOR" && vend !== "ALL" && String(c.setorId) !== String(vend)) return false;
        if (status !== "ALL" && c.statusGiro !== status) return false;
        if (marc === "AMARELO" && !c.vendaInformada) return false;
        if (marc === "SEM_VENDA" && c.vendaInformada) return false;
        if (marc === "SAIDA_CONFIRMADA" && !c.saidaConfirmada) return false;
        if (cat !== "ALL" && c.categoria !== cat) return false;
        if (mat !== "ALL" && c.matriz !== mat) return false;
        return true;
      });

      result.sort((a, b) => {
        if (sortBy === "AMARELOS_PRIMEIRO") {
          if (a.vendaInformada !== b.vendaInformada) return a.vendaInformada ? -1 : 1;
        }
        if (sortBy === "PRIORIDADE") {
          const rank = { "GIRO ZERO": 1, "BAIXO DESEMPENHO": 2, "GIRO EFICIENTE": 3 };
          const rA = rank[a.statusGiro] || 9;
          const rB = rank[b.statusGiro] || 9;
          if (rA !== rB) return rA - rB;
          return (a.realHL || 0) - (b.realHL || 0);
        }
        if (sortBy === "MENOR_RETORNO") {
          return (a.retornoPct || 0) - (b.retornoPct || 0);
        }
        if (sortBy === "MAIOR_FALTA_HL") {
          const fA = Math.max(0, (a.metaHL || 0) - (a.realHL || 0));
          const fB = Math.max(0, (b.metaHL || 0) - (b.realHL || 0));
          return fB - fA;
        }
        if (sortBy === "NOME_AZ") {
          return String(a.cliente).localeCompare(String(b.cliente));
        }
        return 0;
      });

      return result;
    }

    function applyFilters() {
      renderKpis();
      renderClientList();
    }

    function clearSearchInput() {
      const inp = document.getElementById("filterSearch");
      if (inp) inp.value = "";
      applyFilters();
    }

    function resetAllFilters() {
      document.getElementById("filterSearch").value = "";
      if (state.role === "ADMIN") {
        document.getElementById("filterSupervisor").value = "ALL";
        populateVendedorFilterDropdown();
      }
      if (state.role !== "VENDEDOR") {
        document.getElementById("filterVendedor").value = "ALL";
      }
      document.getElementById("filterStatusGiro").value = "ALL";
      document.getElementById("filterMarcacao").value = "ALL";
      document.getElementById("filterCategoria").value = "ALL";
      document.getElementById("filterMatriz").value = "ALL";
      document.getElementById("filterExpurgado").value = "NAO";
      document.getElementById("filterSort").value = "PRIORIDADE";
      applyFilters();
    }

    function quickFilterStatus(st) {
      switchMainTab("carteira");
      document.getElementById("filterStatusGiro").value = st;
      document.getElementById("filterMarcacao").value = "ALL";
      document.getElementById("filterExpurgado").value = "NAO";
      applyFilters();
    }

    function quickFilterYellow() {
      switchMainTab("carteira");
      document.getElementById("filterStatusGiro").value = "ALL";
      document.getElementById("filterMarcacao").value = "AMARELO";
      document.getElementById("filterExpurgado").value = "NAO";
      applyFilters();
    }

    function setListMode(mode) {
      state.listMode = mode;
      const btnCards = document.getElementById("btnViewCards");
      const btnTable = document.getElementById("btnViewTable");
      const cardsCont = document.getElementById("clientCardsContainer");
      const tableCont = document.getElementById("clientTableContainer");

      if (mode === "cards") {
        btnCards.className = "px-2 py-1 rounded-md text-xs font-bold bg-hnk-600 text-white";
        btnTable.className = "px-2 py-1 rounded-md text-xs font-semibold text-slate-600 dark:text-slate-400";
        cardsCont.classList.remove("hidden");
        tableCont.classList.add("hidden");
      } else {
        btnTable.className = "px-2 py-1 rounded-md text-xs font-bold bg-hnk-600 text-white";
        btnCards.className = "px-2 py-1 rounded-md text-xs font-semibold text-slate-600 dark:text-slate-400";
        cardsCont.classList.add("hidden");
        tableCont.classList.remove("hidden");
      }
      saveState(false);
      renderClientList();
    }

    // =========================================================================
    // 7. RENDERIZAÇÃO DE CABEÇALHO, VISIBILIDADE POR PERFIL E KPIS
    // =========================================================================
    function updateHeaderControls() {
      const roleBadge = document.getElementById("activeRoleBadge");
      const subContext = document.getElementById("headerSubcontext");
      const bannerPill = document.getElementById("bannerProfilePill");
      const bannerMesa = document.getElementById("bannerMesaText");
      const bannerTitle = document.getElementById("bannerTitle");

      // Botões exclusivos de Admin
      const tabAdmin = document.getElementById("tabBtnAdmin");
      const tabDeploy = document.getElementById("tabBtnDeploy");
      const tabGraficos = document.getElementById("tabBtnGraficos");
      const btnResetMonth = document.getElementById("btnResetMonthCycle");
      const btnConfirmYellows = document.getElementById("btnAdminConfirmYellows");

      if (!state.loggedIn) {
        roleBadge.textContent = "Entrar";
        subContext.textContent = "Identifique seu Setor ou Mesa para ver sua carteira";
        bannerPill.textContent = "ACESSO PROTEGIDO POR CARTEIRA";
        bannerMesa.textContent = "CDA Benevides";
        bannerTitle.textContent = "Identifique seu Setor ou Mesa para abrir seus clientes";
      } else if (state.role === "VENDEDOR") {
        const setorLabel = state.activeSetorId || "";
        roleBadge.textContent = `Setor ${setorLabel}`;
        subContext.textContent = `Carteira Exclusiva • Setor ${setorLabel}`;
        bannerPill.textContent = `VENDEDOR • SETOR ${setorLabel}`;
        bannerMesa.textContent = state.activeSupId ? `Mesa ${state.activeSupId}` : `Carteira Individual Isolada`;
        bannerTitle.textContent = `Meus Clientes — Setor ${setorLabel}`;
      } else if (state.role === "SUPERVISOR") {
        const mesaLabel = state.activeSupId || "";
        roleBadge.textContent = `Mesa ${mesaLabel}`;
        subContext.textContent = `Visão da Equipe • Mesa ${mesaLabel}`;
        bannerPill.textContent = `SUPERVISOR • MESA ${mesaLabel}`;
        bannerMesa.textContent = `Todos os Vendedores da Mesa ${mesaLabel}`;
        bannerTitle.textContent = `Consolidado da Mesa ${mesaLabel}`;
      } else {
        roleBadge.textContent = `Administrador`;
        subContext.textContent = `Administração Trade • Visão Geral CDA Benevides`;
        bannerPill.textContent = `ADMINISTRADOR • VISÃO TOTAL`;
        bannerMesa.textContent = `Regional DIR REG NORDESTE N • Centro 0026 • Org 5087`;
        bannerTitle.textContent = `Painel Geral de Refrigeração — CDA Benevides`;
      }

      // Oculta abas de Admin para Vendedores/Supervisores comuns
      const isAdmin = state.loggedIn && state.role === "ADMIN" && state.adminUnlocked;
      if (tabDeploy) tabDeploy.classList.toggle("hidden", !isAdmin);
      if (btnResetMonth) btnResetMonth.classList.toggle("hidden", !isAdmin);
      if (btnConfirmYellows) btnConfirmYellows.classList.toggle("hidden", !isAdmin);
      if (tabGraficos) tabGraficos.classList.toggle("hidden", state.loggedIn && state.role === "VENDEDOR");

      const todayBR = new Date().toLocaleDateString("pt-BR");
      const isUpdatedToday = state.lastUpdateDateISO === todayBR;

      const lastUpdateText = document.getElementById("lastUpdateText");
      const syncDot = document.getElementById("syncIndicatorDot");
      const headerPill = document.getElementById("headerUpdatePill");
      const bannerBadge = document.getElementById("bannerLastUpdateBadge");
      const bannerUpdateText = document.getElementById("bannerLastUpdateText");

      const displayStamp = `Última atualização: ${state.lastUpdateLabel}`;
      if (lastUpdateText) lastUpdateText.textContent = displayStamp;
      if (bannerUpdateText) bannerUpdateText.textContent = displayStamp;

      if (isUpdatedToday) {
        if (syncDot) syncDot.className = "w-2 h-2 rounded-full bg-emerald-500";
        if (headerPill) headerPill.className = "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border border-emerald-500/30";
        if (bannerBadge) bannerBadge.className = "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-emerald-400 text-slate-950 shadow-sm";
      } else {
        if (syncDot) syncDot.className = "w-2 h-2 rounded-full bg-amber-500";
        if (headerPill) headerPill.className = "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-bold bg-amber-500/15 text-amber-600 dark:text-amber-300 border border-amber-500/30";
        if (bannerBadge) bannerBadge.className = "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-amber-400 text-slate-950 shadow-sm";
      }

      const s1 = document.getElementById("selectCalcMetricMode");
      const s2 = document.getElementById("selectCalcMetricModeMobile");
      if (s1) s1.value = state.calcMetricMode || "ATIVOS";
      if (s2) s2.value = state.calcMetricMode || "ATIVOS";

      const iconSound = document.getElementById("iconSound");
      if (iconSound) {
        iconSound.setAttribute("data-lucide", state.soundEnabled ? "volume-2" : "volume-x");
        iconSound.className = state.soundEnabled ? "w-4 h-4 text-emerald-600 dark:text-emerald-400" : "w-4 h-4 text-slate-400";
      }

      const scopedAlerts = getScopedAlerts();
      const unread = scopedAlerts.filter(a => !a.read).length;
      const notifBadge = document.getElementById("notifBadge");
      if (notifBadge) {
        notifBadge.textContent = String(unread);
        notifBadge.className = unread > 0
          ? "absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center shadow"
          : "absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-slate-400 text-white text-[10px] font-bold flex items-center justify-center";
      }

      if (window.lucide) lucide.createIcons();
    }

    function renderKpis() {
      const allScoped = getScopedClients();
      const validScoped = allScoped.filter(c => !isClientExpurgado(c));
      const expurgadosCount = allScoped.length - validScoped.length;

      const supFilter = document.getElementById("filterSupervisor")?.value || "ALL";
      const vendFilter = document.getElementById("filterVendedor")?.value || "ALL";
      const scoped = validScoped.filter(c => {
        if (state.role === "ADMIN" && supFilter !== "ALL" && String(c.supId) !== String(supFilter)) return false;
        if (state.role !== "VENDEDOR" && vendFilter !== "ALL" && String(c.setorId) !== String(vendFilter)) return false;
        return true;
      });

      const totalClients = scoped.length;
      const sumAtivos = list => list.reduce((acc, c) => acc + (parseInt(c.ativos) || 1), 0);
      const totalAtivos = sumAtivos(scoped);

      const zeroList = scoped.filter(c => c.statusGiro === "GIRO ZERO");
      const baixoList = scoped.filter(c => c.statusGiro === "BAIXO DESEMPENHO");
      const eficList = scoped.filter(c => c.statusGiro === "GIRO EFICIENTE");
      const yellowList = scoped.filter(c => c.vendaInformada);
      const confirmedList = scoped.filter(c => c.saidaConfirmada);

      const zeroAtivos = sumAtivos(zeroList);
      const baixoAtivos = sumAtivos(baixoList);
      const eficAtivos = sumAtivos(eficList);

      let sumFaltaHL = 0;
      let sumFaltaCaixas = 0;
      scoped.forEach(c => {
        if (c.statusGiro !== "GIRO EFICIENTE") {
          const m = calcClientMetrics(c);
          sumFaltaHL += m.faltaHL;
          sumFaltaCaixas += m.faltaCaixas;
        }
      });

      const useAtivos = (state.calcMetricMode || "ATIVOS") === "ATIVOS";
      const denom = useAtivos ? totalAtivos : totalClients;
      const pctStr = num => denom > 0 ? `${formatBR((num / denom) * 100, 2)}%` : "0,00%";

      document.getElementById("kpiLabelTotal").textContent = useAtivos ? "Ativos Válidos (S/ Exp.)" : "Clientes Válidos (S/ Exp.)";
      document.getElementById("kpiTotalClients").textContent = useAtivos ? String(totalAtivos) : String(totalClients);
      document.getElementById("kpiTotalEquip").textContent = useAtivos
        ? `${totalClients} clientes • ${expurgadosCount} expurgados`
        : `${totalAtivos} ativos • ${expurgadosCount} expurgados`;

      document.getElementById("kpiGiroZeroPctMain").textContent = pctStr(useAtivos ? zeroAtivos : zeroList.length);
      document.getElementById("kpiGiroZeroSub").textContent = `${zeroAtivos} ativos (${zeroList.length} clientes)`;

      document.getElementById("kpiBaixoDesempPctMain").textContent = pctStr(useAtivos ? baixoAtivos : baixoList.length);
      document.getElementById("kpiBaixoDesempSub").textContent = `${baixoAtivos} ativos (${baixoList.length} clientes)`;

      document.getElementById("kpiGiroEficientePctMain").textContent = pctStr(useAtivos ? eficAtivos : eficList.length);
      document.getElementById("kpiGiroEficienteSub").textContent = `${eficAtivos} ativos (${eficList.length} clientes)`;

      document.getElementById("kpiAmarelos").textContent = String(yellowList.length);
      document.getElementById("kpiSaidasConfirmadas").textContent = `${confirmedList.length} saídas no mês`;
      document.getElementById("badgeTabAmarelos").textContent = String(yellowList.length);

      document.getElementById("kpiFaltaCaixas").textContent = `${sumFaltaCaixas} cx`;
      document.getElementById("kpiFaltaHL").textContent = `Faltam ${formatBR(sumFaltaHL, 2)} HL`;
    }

    function getStatusBadgeHTML(statusGiro) {
      if (statusGiro === "GIRO ZERO") {
        return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30">
          <span class="w-1.5 h-1.5 rounded-full bg-red-500"></span>GIRO ZERO
        </span>`;
      }
      if (statusGiro === "BAIXO DESEMPENHO") {
        return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-500/30">
          <span class="w-1.5 h-1.5 rounded-full bg-orange-500"></span>BAIXO DESEMPENHO
        </span>`;
      }
      return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
        <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>GIRO EFICIENTE
      </span>`;
    }

    function renderClientList() {
      const cardsCont = document.getElementById("clientCardsContainer");
      const tableBody = document.getElementById("clientTableBody");

      if (!state.loggedIn) {
        document.getElementById("filterResultCount").textContent = "Acesso restrito — Identifique seu Setor ou Mesa";
        cardsCont.innerHTML = `
          <div class="col-span-full p-8 rounded-2xl bg-white dark:bg-graphite-900 border border-slate-200 dark:border-white/10 text-center space-y-3">
            <h3 class="text-base font-extrabold">Identifique seu Setor ou Mesa para ver seus clientes</h3>
            <p class="text-xs text-slate-500">Para garantir que cada vendedor veja somente a própria carteira no celular, faça seu acesso abaixo.</p>
            <button onclick="openRoleModal()" class="px-4 py-2 rounded-xl bg-hnk-600 text-white text-xs font-extrabold">Entrar com Setor / Mesa</button>
          </div>`;
        tableBody.innerHTML = `<tr><td colspan="12" class="p-6 text-center text-slate-500">Faça login para visualizar sua carteira.</td></tr>`;
        return;
      }

      const list = getFilteredClients();
      document.getElementById("filterResultCount").textContent = `Exibindo ${list.length} cliente(s)`;

      if (state.clients.length === 0) {
        const cleanReadyHTML = `
          <div class="col-span-full p-8 rounded-2xl bg-white dark:bg-graphite-900 border-2 border-dashed border-hnk-600/40 text-center space-y-3">
            <div class="w-12 h-12 rounded-2xl bg-hnk-600/15 text-hnk-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
              <i data-lucide="clipboard-paste" class="w-6 h-6"></i>
            </div>
            <h3 class="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white">
              Base Pronta para Receber a Planilha do Mês!
            </h3>
            <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-xl mx-auto">
              Acesse a aba <b>Colar Planilha / Senhas (Admin)</b> para colar as ~670 linhas do Excel ou clique no ícone de atualização no topo se já conectou a Nuvem Google.
            </p>
            <div class="pt-1 flex flex-wrap justify-center gap-2">
              <button onclick="handleAdminGearClick()" class="px-4 py-2.5 rounded-xl bg-hnk-600 hover:bg-hnk-500 text-white text-xs sm:text-sm font-extrabold shadow-lg shadow-hnk-600/25 transition inline-flex items-center gap-2">
                <i data-lucide="database" class="w-4 h-4"></i>
                <span>Colar Planilha (Admin)</span>
              </button>
              <button onclick="manualCloudPull()" class="px-4 py-2.5 rounded-xl bg-slate-200 dark:bg-white/10 text-xs sm:text-sm font-bold transition inline-flex items-center gap-2">
                <i data-lucide="refresh-cw" class="w-4 h-4"></i>
                <span>Buscar da Nuvem</span>
              </button>
            </div>
          </div>`;
        cardsCont.innerHTML = cleanReadyHTML;
        tableBody.innerHTML = `<tr><td colspan="12" class="p-8 text-center text-slate-500 font-semibold">Base aguardando atualização.</td></tr>`;
        if (window.lucide) lucide.createIcons();
        return;
      }

      if (list.length === 0) {
        const emptyFilterHTML = `<div class="col-span-full p-8 rounded-2xl bg-white dark:bg-graphite-900 border border-slate-200 dark:border-white/10 text-center space-y-2">
          <p class="text-sm font-bold text-slate-700 dark:text-slate-200">Nenhum cliente encontrado para o Setor/Mesa ou filtro selecionado.</p>
          <div class="flex items-center justify-center gap-2 pt-1">
            <button onclick="resetAllFilters()" class="px-3 py-1.5 rounded-xl bg-hnk-600 text-white text-xs font-bold">Limpar Filtros</button>
            <button onclick="openRoleModal()" class="px-3 py-1.5 rounded-xl bg-slate-200 dark:bg-white/10 text-xs font-bold">Trocar Setor / Mesa</button>
          </div>
        </div>`;
        cardsCont.innerHTML = emptyFilterHTML;
        tableBody.innerHTML = `<tr><td colspan="12" class="p-6 text-center text-slate-500">Nenhum cliente encontrado para este filtro.</td></tr>`;
        return;
      }

      // Render Cards
      cardsCont.innerHTML = list.map(c => {
        const m = calcClientMetrics(c);
        const progressPct = Math.min(100, Math.max(0, m.calcRetorno));
        const isExp = isClientExpurgado(c);
        const mStart = c.monthStartStatus || c.statusGiro;
        const leftZeroInMonth = mStart === "GIRO ZERO" && c.statusGiro !== "GIRO ZERO";

        const barColor = c.statusGiro === "GIRO EFICIENTE"
          ? "bg-emerald-500"
          : (c.vendaInformada ? "bg-amber-400" : (c.statusGiro === "GIRO ZERO" ? "bg-red-500" : "bg-orange-500"));

        const cardBorder = c.vendaInformada
          ? "border-2 border-amber-400 bg-amber-50/30 dark:bg-amber-500/5 yellow-glow"
          : "border border-slate-200 dark:border-white/10 bg-white dark:bg-graphite-900";

        return `
        <article class="rounded-2xl p-4 shadow-sm transition flex flex-col justify-between gap-3 ${cardBorder}">
          <div class="space-y-2.5">
            <!-- Top Badges -->
            <div class="flex flex-wrap items-center justify-between gap-1.5">
              <div class="flex flex-wrap items-center gap-1.5">
                ${getStatusBadgeHTML(c.statusGiro)}
                ${isExp ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-slate-500/20 text-slate-400 border border-slate-500/30">EXPURGADO</span>` : ""}
                ${c.vendaInformada ? `
                  <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-amber-400 text-slate-950 shadow-sm">
                    ★ VENDA (${c.vendaCaixas} cx)
                  </span>` : ""}
                ${leftZeroInMonth ? `
                  <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-sky-500/20 text-sky-500 border border-sky-500/30">
                    ↗ Saiu do Zero no Mês
                  </span>` : ""}
              </div>
              <span class="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-300">
                ID: ${c.idCliente}
              </span>
            </div>

            <!-- Client Name & Details -->
            <div>
              <h3 class="font-extrabold text-sm sm:text-base text-slate-900 dark:text-white leading-snug">${c.cliente}</h3>
              <p class="text-[11px] text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                CNPJ/CPF: ${c.cnpj} • ${c.idGrupo} (${c.grupo}) • ${c.categoria} • Matriz: <b>${c.matriz}</b>
              </p>
            </div>

            <!-- Setor & Mesa Info -->
            <div class="p-2.5 rounded-xl bg-slate-50 dark:bg-graphite-950 border border-slate-200/70 dark:border-white/5 text-xs space-y-1">
              <div class="flex items-center justify-between">
                <span class="text-slate-500 dark:text-slate-400">Setor (${c.setorId}):</span>
                <span class="font-bold text-slate-800 dark:text-slate-200 truncate max-w-[190px]">${c.vendedorNome || ("Setor " + c.setorId)}</span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-slate-500 dark:text-slate-400">Mesa (${c.supId}):</span>
                <span class="font-medium text-slate-600 dark:text-slate-300 truncate max-w-[190px]">${c.supNome || ("Mesa " + c.supId)}</span>
              </div>
            </div>

            <!-- Metrics Box: Real HL, Meta HL, Falta HL e Quantas Caixas Faltam Vender -->
            <div class="grid grid-cols-3 gap-2 text-center p-2.5 rounded-xl bg-slate-100/70 dark:bg-white/5 border border-slate-200/60 dark:border-white/5">
              <div>
                <div class="text-[10px] uppercase font-bold text-slate-400">Real / Meta</div>
                <div class="text-xs sm:text-sm font-extrabold font-mono text-slate-900 dark:text-white mt-0.5">
                  ${formatBR(m.real, 2)} / ${formatBR(m.meta, 1)} <span class="text-[10px] font-normal">HL</span>
                </div>
                <div class="text-[10px] text-slate-500">${c.ativos} ativo(s)</div>
              </div>
              <div>
                <div class="text-[10px] uppercase font-bold text-slate-400">Retorno %</div>
                <div class="text-xs sm:text-sm font-extrabold font-mono ${m.calcRetorno >= 100 ? 'text-emerald-500' : (m.calcRetorno === 0 ? 'text-red-500' : 'text-orange-500')} mt-0.5">
                  ${c.retornoPct}%
                </div>
                <div class="text-[10px] text-slate-500">Início mês: ${mStart === 'GIRO ZERO' ? 'Zero' : (mStart === 'BAIXO DESEMPENHO' ? 'Baixo' : 'Efic.')}</div>
              </div>
              <div>
                <div class="text-[10px] uppercase font-bold text-slate-400">Falta Vender</div>
                ${m.faltaCaixas > 0 ? `
                  <div class="text-xs sm:text-sm font-extrabold font-mono text-amber-600 dark:text-amber-400 mt-0.5">
                    ${m.faltaCaixas} cx
                  </div>
                  <div class="text-[10px] font-mono text-slate-500">(${formatBR(m.faltaHL, 2)} HL)</div>
                ` : `
                  <div class="text-xs sm:text-sm font-extrabold text-emerald-600 dark:text-emerald-400 mt-0.5">Meta Batida!</div>
                  <div class="text-[10px] text-emerald-500">0 cx</div>
                `}
              </div>
            </div>

            <!-- Progress bar -->
            <div class="w-full h-2 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
              <div class="h-full ${barColor} transition-all duration-300" style="width: ${progressPct}%"></div>
            </div>

            <!-- Yellow Sale Notice Box if Marked -->
            ${c.vendaInformada ? `
              <div class="p-2.5 rounded-xl bg-amber-400/20 border border-amber-400/50 text-xs space-y-1">
                <div class="flex items-center justify-between font-bold text-amber-800 dark:text-amber-200">
                  <span>🟡 Previsão: ${c.vendaPrevisao || "Faturamento em andamento"}</span>
                  <span>+${c.vendaCaixas} cx</span>
                </div>
                <p class="text-[11px] text-amber-900/90 dark:text-amber-100/90">${c.vendaObs || "Venda registrada pelo time comercial."}</p>
                <div class="text-[10px] text-amber-700 dark:text-amber-300/80">Por: ${c.vendaAutor} em ${c.vendaData}</div>
              </div>
            ` : ""}
          </div>

          <!-- Action Buttons -->
          <div class="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-white/5">
            ${c.vendaInformada ? `
              <button onclick="openInformSaleModal('${c.idCliente}')" class="flex-1 py-2 px-3 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-700 dark:text-amber-300 border border-amber-500/40 text-xs font-extrabold transition">
                Editar Marcação Amarela
              </button>
              <button onclick="clearYellowMark('${c.idCliente}')" title="Desfazer marcação amarela" class="py-2 px-2.5 rounded-xl bg-slate-100 hover:bg-red-500/20 text-slate-600 dark:text-slate-300 hover:text-red-500 text-xs font-bold transition">
                Desfazer
              </button>
            ` : `
              <button onclick="openInformSaleModal('${c.idCliente}')" class="flex-1 py-2 px-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-extrabold shadow-sm transition flex items-center justify-center gap-1.5">
                <span>🟡 Marcar Venda (Amarelo)</span>
              </button>
            `}
            ${state.role === "ADMIN" ? `
              <button onclick="openEditClientModal('${c.idCliente}')" title="Editar / Excluir Acompanhamento" class="py-2 px-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 text-xs font-bold transition">
                Editar
              </button>
            ` : ""}
          </div>
        </article>`;
      }).join("");

      // Render Table
      tableBody.innerHTML = list.map(c => {
        const m = calcClientMetrics(c);
        const rowBg = c.vendaInformada
          ? "bg-amber-500/10 hover:bg-amber-500/20"
          : "hover:bg-slate-50 dark:hover:bg-white/5";

        return `
        <tr class="${rowBg} transition">
          <td class="py-2.5 px-3 whitespace-nowrap">
            <div class="flex flex-col gap-1">
              ${getStatusBadgeHTML(c.statusGiro)}
              ${c.vendaInformada ? `<span class="inline-block px-2 py-0.5 rounded text-[10px] font-extrabold bg-amber-400 text-slate-950">🟡 Venda: ${c.vendaCaixas} cx</span>` : ""}
            </div>
          </td>
          <td class="py-2.5 px-3 font-mono font-bold">${c.idCliente}</td>
          <td class="py-2.5 px-3">
            <div class="font-bold text-slate-900 dark:text-white">${c.cliente}</div>
            <div class="text-[10px] font-mono text-slate-400">${c.cnpj} • Matriz ${c.matriz}</div>
          </td>
          <td class="py-2.5 px-3">
            <div class="font-medium">${c.idGrupo} - ${c.grupo}</div>
            <div class="text-[10px] text-slate-400">${c.categoria}</div>
          </td>
          <td class="py-2.5 px-3">
            <div class="font-bold">${c.supId}</div>
            <div class="text-[10px] text-slate-400">${c.supNome}</div>
          </td>
          <td class="py-2.5 px-3">
            <div class="font-bold text-hnk-700 dark:text-emerald-400">${c.setorId}</div>
            <div class="text-[10px] text-slate-400">${c.vendedorNome}</div>
          </td>
          <td class="py-2.5 px-3 text-center font-mono font-bold">${c.ativos}</td>
          <td class="py-2.5 px-3 text-right font-mono font-bold">${formatBR(m.real, 2)}</td>
          <td class="py-2.5 px-3 text-right font-mono">${formatBR(m.meta, 1)}</td>
          <td class="py-2.5 px-3 text-right font-mono font-bold">${c.retornoPct}%</td>
          <td class="py-2.5 px-3 text-right font-mono">
            ${m.faltaCaixas > 0
              ? `<span class="font-extrabold text-amber-600 dark:text-amber-400">${m.faltaCaixas} cx</span> <span class="text-[10px] text-slate-400">(${formatBR(m.faltaHL, 2)} HL)</span>`
              : `<span class="text-emerald-500 font-bold">0 cx</span>`}
          </td>
          <td class="py-2.5 px-3 text-center whitespace-nowrap">
            <button onclick="openInformSaleModal('${c.idCliente}')" class="px-2 py-1 rounded bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-[11px] mr-1">
              🟡 Venda
            </button>
            ${state.role === "ADMIN" ? `
              <button onclick="openEditClientModal('${c.idCliente}')" class="px-2 py-1 rounded bg-slate-200 dark:bg-white/10 font-bold text-[11px]">
                Editar
              </button>
            ` : ""}
          </td>
        </tr>`;
      }).join("");
    }

    // =========================================================================
    // 8. MARCAÇÃO AMARELA ("VENDA INFORMADA / PREVISÃO DE SAÍDA") & NUVEM
    // =========================================================================
    function openInformSaleModal(idCliente) {
      const c = state.clients.find(item => String(item.idCliente) === String(idCliente));
      if (!c) return;
      const m = calcClientMetrics(c);

      document.getElementById("saleModalClientId").value = c.idCliente;
      document.getElementById("saleModalClientName").textContent = `${c.idCliente} — ${c.cliente}`;
      document.getElementById("saleModalClientMetaInfo").textContent =
        `Status Oficial: ${c.statusGiro} | Real: ${formatBR(m.real, 2)} HL | Meta: ${formatBR(m.meta, 1)} HL | Faltam: ${m.faltaCaixas} caixas (${formatBR(m.faltaHL, 2)} HL)`;

      const suggestedBoxes = c.vendaInformada && c.vendaCaixas > 0 ? c.vendaCaixas : Math.max(1, m.faltaCaixas || 10);
      document.getElementById("saleInputCaixas").value = String(suggestedBoxes);
      document.getElementById("saleInputObs").value = c.vendaObs || "";
      if (c.vendaPrevisao) {
        document.getElementById("saleInputPrevisao").value = c.vendaPrevisao;
      }
      updateSalePreviewHL();
      document.getElementById("modalInformSale").classList.remove("hidden");
    }

    function closeInformSaleModal() {
      document.getElementById("modalInformSale").classList.add("hidden");
    }

    function updateSalePreviewHL() {
      const cx = parseInt(document.getElementById("saleInputCaixas").value) || 0;
      const hl = cx * (parseFloat(state.boxFactorHL) || 0.0396);
      document.getElementById("saleInputHL").value = `+${formatBR(hl, 2)} HL`;
    }

    function confirmInformSale() {
      const idCliente = document.getElementById("saleModalClientId").value;
      const c = state.clients.find(item => String(item.idCliente) === String(idCliente));
      if (!c) return;

      const cx = Math.max(1, parseInt(document.getElementById("saleInputCaixas").value) || 1);
      const prev = document.getElementById("saleInputPrevisao").value;
      const obs = (document.getElementById("saleInputObs").value || "").trim();

      let autor = "Administrador";
      if (state.role === "VENDEDOR") {
        autor = `Setor ${state.activeSetorId || c.setorId}`;
      } else if (state.role === "SUPERVISOR") {
        autor = `Mesa ${state.activeSupId || c.supId}`;
      }

      const nowStr = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

      c.vendaInformada = true;
      c.vendaCaixas = cx;
      c.vendaPrevisao = prev;
      c.vendaObs = obs || `Venda informada de ${cx} caixas aguardando faturamento.`;
      c.vendaAutor = autor;
      c.vendaData = `Hoje às ${nowStr}`;

      state.alerts.unshift({
        id: "al_" + Date.now(),
        type: "AMARELO",
        title: `🟡 Venda Informada (+${cx} cx) — ${c.cliente}`,
        desc: `${autor} marcou venda no cliente ${c.idCliente} (${c.statusGiro}). Previsão: ${prev}.`,
        time: `Hoje, ${nowStr}`,
        read: false,
        clientId: c.idCliente
      });
      if (state.alerts.length > 80) state.alerts = state.alerts.slice(0, 80);

      saveState(true);
      closeInformSaleModal();
      renderAll();
      playBeepSound("yellow");
      showToast(`Cliente ${c.cliente} marcado em Amarelo (+${cx} cx) e sincronizado na nuvem!`, "warning");
    }

    function clearYellowMark(idCliente) {
      const c = state.clients.find(item => String(item.idCliente) === String(idCliente));
      if (!c) return;
      c.vendaInformada = false;
      c.vendaCaixas = 0;
      c.vendaObs = "";
      saveState(true);
      renderAll();
      showToast(`Marcação amarela removida do cliente ${c.idCliente}.`, "info");
    }

    function renderYellowTab() {
      const scoped = getScopedClients().filter(c => !isClientExpurgado(c) && c.vendaInformada);
      const cont = document.getElementById("yellowListContainer");

      if (scoped.length === 0) {
        cont.innerHTML = `<div class="col-span-full p-8 rounded-2xl bg-white dark:bg-graphite-900 border border-slate-200 dark:border-white/10 text-center space-y-2">
          <p class="text-sm font-bold">Nenhum cliente marcado com Sinal Amarelo na sua carteira/mesa.</p>
          <p class="text-xs text-slate-500">Na aba "Acompanhamento de Giro", clique em "🟡 Marcar Venda (Amarelo)" em qualquer cliente vendido.</p>
        </div>`;
        return;
      }

      cont.innerHTML = scoped.map(c => {
        const m = calcClientMetrics(c);
        const hlVendido = (c.vendaCaixas || 0) * state.boxFactorHL;
        const projHL = m.real + hlVendido;
        const vaiSairProEficiente = projHL >= m.meta;

        return `
        <div class="p-4 rounded-2xl bg-white dark:bg-graphite-900 border-2 border-amber-400 shadow-sm space-y-2.5">
          <div class="flex items-center justify-between gap-2">
            <span class="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-amber-400 text-slate-950">
              🟡 +${c.vendaCaixas} caixas (+${formatBR(hlVendido, 2)} HL)
            </span>
            <span class="text-xs font-mono font-bold text-slate-500">ID: ${c.idCliente}</span>
          </div>
          <h4 class="font-extrabold text-sm sm:text-base">${c.cliente}</h4>
          <p class="text-xs text-slate-500 dark:text-slate-400">
            Setor ${c.setorId} (${c.vendedorNome}) • Mesa ${c.supId} (${c.supNome})
          </p>
          <div class="p-2.5 rounded-xl bg-slate-50 dark:bg-graphite-950 border border-slate-200 dark:border-white/10 text-xs flex items-center justify-between">
            <span>HL Atual: <b>${formatBR(m.real, 2)} HL</b> → Projetado: <b class="text-emerald-500">${formatBR(projHL, 2)} HL</b> (Meta: ${formatBR(m.meta, 1)} HL)</span>
            <span class="px-2 py-0.5 rounded font-bold ${vaiSairProEficiente ? 'bg-emerald-500/20 text-emerald-500' : 'bg-orange-500/20 text-orange-400'}">
              ${vaiSairProEficiente ? 'Vai p/ GIRO EFICIENTE!' : 'Sobe p/ Baixo Desemp.'}
            </span>
          </div>
          <p class="text-xs text-amber-700 dark:text-amber-300 font-medium">
            "${c.vendaObs}" — ${c.vendaAutor} (${c.vendaData}) • Previsão: <b>${c.vendaPrevisao}</b>
          </p>
        </div>`;
      }).join("");
    }

    function simulateConfirmAllYellows() {
      const yellows = state.clients.filter(c => c.vendaInformada);
      if (yellows.length === 0) {
        showToast("Não há clientes em amarelo para confirmar saída no momento.", "info");
        return;
      }

      let countConfirmed = 0;
      yellows.forEach(c => {
        const addedHL = (c.vendaCaixas || 0) * state.boxFactorHL;
        c.prevStatus = c.statusGiro;
        c.prevHL = c.realHL;
        c.realHL = +(c.realHL + addedHL).toFixed(2);
        c.retornoPct = c.metaHL > 0 ? Math.round((c.realHL / c.metaHL) * 100) : 100;

        if (c.realHL >= c.metaHL) {
          c.statusGiro = "GIRO EFICIENTE";
          c.saidaConfirmada = true;
        } else if (c.realHL > 0) {
          c.statusGiro = "BAIXO DESEMPENHO";
        }
        c.vendaInformada = false;
        countConfirmed++;
      });

      const nowStr = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      state.alerts.unshift({
        id: "al_" + Date.now(),
        type: "SAIDA_CONFIRMADA",
        title: `✅ ${countConfirmed} Saída(s) Confirmada(s)!`,
        desc: `${countConfirmed} cliente(s) que estavam com sinal amarelo tiveram o volume confirmado.`,
        time: `Hoje, ${nowStr}`,
        read: false,
        clientId: ""
      });

      saveState(true);
      renderAll();
      playBeepSound("confirm");
      showToast(`${countConfirmed} cliente(s) confirmados!`, "success");
    }

    // =========================================================================
    // 9. GRÁFICOS E RANKING DINÂMICO POR SETOR / MESA (SEM EXPURGOS)
    // =========================================================================
    function renderChartsAndRanking() {
      const scoped = getScopedClients().filter(c => !isClientExpurgado(c));
      const useAtivos = (state.calcMetricMode || "ATIVOS") === "ATIVOS";
      const sumMetric = list => useAtivos
        ? list.reduce((acc, c) => acc + (parseInt(c.ativos) || 1), 0)
        : list.length;

      const zeroVal = sumMetric(scoped.filter(c => c.statusGiro === "GIRO ZERO"));
      const baixoVal = sumMetric(scoped.filter(c => c.statusGiro === "BAIXO DESEMPENHO"));
      const eficVal = sumMetric(scoped.filter(c => c.statusGiro === "GIRO EFICIENTE"));

      const isDark = document.documentElement.classList.contains("dark");
      const textColor = isDark ? "#e2e8f0" : "#334155";

      const ctxDonut = document.getElementById("chartStatusDonut");
      if (ctxDonut && window.Chart) {
        if (chartDonutInstance) chartDonutInstance.destroy();
        chartDonutInstance = new Chart(ctxDonut, {
          type: "doughnut",
          data: {
            labels: ["Giro Zero", "Baixo Desempenho", "Giro Eficiente"],
            datasets: [{
              data: [zeroVal, baixoVal, eficVal],
              backgroundColor: ["#ef4444", "#f97316", "#10b981"],
              borderWidth: 0
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                position: "bottom",
                labels: { color: textColor, font: { family: "Inter", weight: "bold", size: 11 } }
              }
            }
          }
        });
      }

      const sups = getDynamicSupervisores();
      const ctxMesas = document.getElementById("chartMesasBar");
      if (ctxMesas && window.Chart) {
        if (chartMesasInstance) chartMesasInstance.destroy();
        const validAll = getScopedClients().filter(c => !isClientExpurgado(c));
        const supsToShow = state.role === "SUPERVISOR"
          ? sups.filter(s => s.id === String(state.activeSupId))
          : sups;

        const labels = supsToShow.map(s => `Mesa ${s.id}`);
        const dataZero = supsToShow.map(s => sumMetric(validAll.filter(c => String(c.supId) === s.id && c.statusGiro === "GIRO ZERO")));
        const dataBaixo = supsToShow.map(s => sumMetric(validAll.filter(c => String(c.supId) === s.id && c.statusGiro === "BAIXO DESEMPENHO")));
        const dataEfic = supsToShow.map(s => sumMetric(validAll.filter(c => String(c.supId) === s.id && c.statusGiro === "GIRO EFICIENTE")));
        const dataYellow = supsToShow.map(s => sumMetric(validAll.filter(c => String(c.supId) === s.id && c.vendaInformada)));

        chartMesasInstance = new Chart(ctxMesas, {
          type: "bar",
          data: {
            labels,
            datasets: [
              { label: "Giro Zero", data: dataZero, backgroundColor: "#ef4444", borderRadius: 6 },
              { label: "Baixo Desemp.", data: dataBaixo, backgroundColor: "#f97316", borderRadius: 6 },
              { label: "Giro Eficiente", data: dataEfic, backgroundColor: "#10b981", borderRadius: 6 },
              { label: "Sinal Amarelo", data: dataYellow, backgroundColor: "#facc15", borderRadius: 6 }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              x: { ticks: { color: textColor, font: { size: 11 } }, grid: { display: false } },
              y: { beginAtZero: true, ticks: { color: textColor, precision: 0 } }
            },
            plugins: {
              legend: {
                position: "bottom",
                labels: { color: textColor, font: { family: "Inter", weight: "bold", size: 11 } }
              }
            }
          }
        });
      }

      const tbody = document.getElementById("rankingVendedoresBody");
      if (!tbody) return;

      let filterSup = "ALL";
      if (state.role === "SUPERVISOR") filterSup = state.activeSupId;
      let setoresVisiveis = getDynamicSetores(filterSup);
      if (state.role === "VENDEDOR") {
        setoresVisiveis = setoresVisiveis.filter(s => s.id === String(state.activeSetorId));
      }

      if (setoresVisiveis.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" class="p-6 text-center text-slate-500">Cole sua planilha na aba Admin para visualizar o ranking por Setor e Mesa.</td></tr>`;
        return;
      }

      tbody.innerHTML = setoresVisiveis.map(st => {
        const cli = state.clients.filter(c => !isClientExpurgado(c) && String(c.setorId) === String(st.id));
        const totAtivos = sumMetric(cli);
        const z = sumMetric(cli.filter(c => c.statusGiro === "GIRO ZERO"));
        const b = sumMetric(cli.filter(c => c.statusGiro === "BAIXO DESEMPENHO"));
        const e = sumMetric(cli.filter(c => c.statusGiro === "GIRO EFICIENTE"));
        const y = cli.filter(c => c.vendaInformada).length;
        const realSum = cli.reduce((acc, c) => acc + (parseFloat(c.realHL) || 0), 0);
        const metaSum = cli.reduce((acc, c) => acc + (parseFloat(c.metaHL) || 0), 0);
        const faltaBoxes = cli.reduce((acc, c) => acc + (c.statusGiro !== "GIRO EFICIENTE" ? calcClientMetrics(c).faltaCaixas : 0), 0);

        const pZ = totAtivos > 0 ? formatBR((z / totAtivos) * 100, 1) + "%" : "0%";
        const pB = totAtivos > 0 ? formatBR((b / totAtivos) * 100, 1) + "%" : "0%";
        const pE = totAtivos > 0 ? formatBR((e / totAtivos) * 100, 1) + "%" : "0%";

        return `
        <tr class="hover:bg-slate-50 dark:hover:bg-white/5 transition">
          <td class="py-2.5 px-2.5 font-bold text-slate-900 dark:text-white">
            <span class="font-mono text-hnk-700 dark:text-emerald-400">Setor ${st.id}</span> ${st.nome ? `— ${st.nome}` : ""}
          </td>
          <td class="py-2.5 px-2.5 text-slate-500 dark:text-slate-400">Mesa ${st.supId}</td>
          <td class="py-2.5 px-2.5 text-center font-mono font-bold">${totAtivos} <span class="text-[10px] text-slate-400">(${cli.length} cli)</span></td>
          <td class="py-2.5 px-2.5 text-center font-mono font-bold text-red-500">${z} <span class="text-[10px]">(${pZ})</span></td>
          <td class="py-2.5 px-2.5 text-center font-mono font-bold text-orange-500">${b} <span class="text-[10px]">(${pB})</span></td>
          <td class="py-2.5 px-2.5 text-center font-mono font-bold text-emerald-500">${e} <span class="text-[10px]">(${pE})</span></td>
          <td class="py-2.5 px-2.5 text-center font-mono font-bold text-amber-500">${y}</td>
          <td class="py-2.5 px-2.5 text-right font-mono">${formatBR(realSum, 2)} / ${formatBR(metaSum, 1)} HL</td>
          <td class="py-2.5 px-2.5 text-right font-mono font-bold text-amber-600 dark:text-amber-400">${faltaBoxes} cx</td>
          <td class="py-2.5 px-2.5 text-center">
            <button onclick="jumpToVendedorCarteira('${st.supId}', '${st.id}')" class="px-2.5 py-1 rounded-lg bg-hnk-600 hover:bg-hnk-500 text-white text-[11px] font-bold">
              Ver Setor
            </button>
          </td>
        </tr>`;
      }).join("");
    }

    function jumpToVendedorCarteira(supId, setorId) {
      if (state.role === "ADMIN") {
        document.getElementById("filterSupervisor").value = supId;
        populateVendedorFilterDropdown();
        document.getElementById("filterVendedor").value = setorId;
      } else if (state.role === "SUPERVISOR") {
        document.getElementById("filterVendedor").value = setorId;
      }
      switchMainTab("carteira");
      applyFilters();
    }

    // =========================================================================
    // 10. EVOLUÇÃO NO MÊS, TRANSIÇÕES DO GIRO ZERO & PROJEÇÃO DIÁRIA
    // =========================================================================
    function renderPeriodAnalysis() {
      const scoped = getScopedClients().filter(c => !isClientExpurgado(c));
      const compareMode = document.getElementById("periodCompareMode")?.value || "MONTH_START";
      const filterTrans = document.getElementById("filterTransitionType")?.value || "MOVED_ONLY";

      const getStartStatus = c => compareMode === "MONTH_START"
        ? (c.monthStartStatus || c.prevStatus || c.statusGiro)
        : (c.prevStatus || c.statusGiro);

      const getStartHL = c => compareMode === "MONTH_START"
        ? (typeof c.monthStartHL === "number" ? c.monthStartHL : (typeof c.prevHL === "number" ? c.prevHL : c.realHL))
        : (typeof c.prevHL === "number" ? c.prevHL : c.realHL);

      const sumAtivos = list => list.reduce((acc, c) => acc + (parseInt(c.ativos) || 1), 0);

      // 1. Giro Zero -> Giro Eficiente
      const zeroToEficList = scoped.filter(c => getStartStatus(c) === "GIRO ZERO" && c.statusGiro === "GIRO EFICIENTE");
      // 2. Giro Zero -> Baixo Desempenho
      const zeroToBaixoList = scoped.filter(c => getStartStatus(c) === "GIRO ZERO" && c.statusGiro === "BAIXO DESEMPENHO");
      // 3. Baixo Desempenho -> Giro Eficiente
      const baixoToEficList = scoped.filter(c => getStartStatus(c) === "BAIXO DESEMPENHO" && c.statusGiro === "GIRO EFICIENTE");
      // 4. Regressão (Baixo ou Eficiente -> Giro Zero)
      const regressedList = scoped.filter(c => getStartStatus(c) !== "GIRO ZERO" && c.statusGiro === "GIRO ZERO");

      const zeroToEficAtivos = sumAtivos(zeroToEficList);
      const zeroToBaixoAtivos = sumAtivos(zeroToBaixoList);
      const baixoToEficAtivos = sumAtivos(baixoToEficList);
      const regressedAtivos = sumAtivos(regressedList);

      document.getElementById("projZeroToEfic").textContent = `${zeroToEficAtivos} ativ.`;
      document.getElementById("projZeroToEficSub").textContent = `${zeroToEficList.length} cliente(s) direto p/ eficiente`;

      document.getElementById("projZeroToBaixo").textContent = `${zeroToBaixoAtivos} ativ.`;
      document.getElementById("projZeroToBaixoSub").textContent = `${zeroToBaixoList.length} cliente(s) saíram p/ baixo des.`;

      document.getElementById("projBaixoToEfic").textContent = `${baixoToEficAtivos} ativ.`;
      document.getElementById("projBaixoToEficSub").textContent = `${baixoToEficList.length} cliente(s) subiram p/ eficiente`;

      document.getElementById("projRegressed").textContent = `${regressedAtivos} ativ.`;
      document.getElementById("projRegressedSub").textContent = `${regressedList.length} cliente(s) caíram p/ zero`;

      // Cálculo de Ritmo Diário (Quantos equipamentos saem do Giro Zero por dia no mês) e Projeção de Fechamento
      const totalAtivosCarteira = sumAtivos(scoped);
      const currentZeroAtivos = sumAtivos(scoped.filter(c => c.statusGiro === "GIRO ZERO"));
      const totalExitedZeroAtivos = zeroToEficAtivos + zeroToBaixoAtivos;

      const snaps = Array.isArray(state.dailySnapshots) ? state.dailySnapshots : [];
      const daysElapsed = Math.max(1, snaps.length > 1 ? snaps.length - 1 : 1);
      const dailyExitRate = totalExitedZeroAtivos / daysElapsed;

      const now = new Date();
      const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const remainingDaysInMonth = Math.max(0, lastDayOfMonth - now.getDate());
      const projectedRemainingZeroAtivos = Math.max(0, Math.round(currentZeroAtivos - (dailyExitRate * remainingDaysInMonth)));
      const projectedZeroPct = totalAtivosCarteira > 0
        ? (projectedRemainingZeroAtivos / totalAtivosCarteira) * 100
        : 0;

      document.getElementById("projDailyRate").textContent = `${formatBR(dailyExitRate, 1)}/dia`;
      document.getElementById("projDailyRateSub").textContent = `${totalExitedZeroAtivos} ativos saíram do Zero no mês`;

      document.getElementById("projEndOfMonthZero").textContent = `${formatBR(projectedZeroPct, 2)}%`;
      document.getElementById("projDaysNeeded").textContent = remainingDaysInMonth > 0
        ? `Projeção p/ ${remainingDaysInMonth} dia(s) restante(s) (${projectedRemainingZeroAtivos} ativ.)`
        : `Fechamento do mês atual`;

      // Renderiza Histórico Diário e Gráfico de Tendência do Mês
      document.getElementById("monthlySnapshotsCountBadge").textContent = `${snaps.length} dia(s) registrado(s) no mês`;

      const histBody = document.getElementById("dailyHistoryTableBody");
      if (histBody) {
        if (snaps.length === 0) {
          histBody.innerHTML = `<tr><td colspan="4" class="py-4 text-center text-slate-500">Nenhuma carga diária registrada ainda.</td></tr>`;
        } else {
          histBody.innerHTML = snaps.slice().reverse().map(s => `
            <tr>
              <td class="py-1.5 px-1.5 font-bold">${s.dateLabel}</td>
              <td class="py-1.5 px-1.5 text-right text-red-500 font-bold">${formatBR(s.zeroPct, 2)}% <span class="text-[9px] text-slate-400">(${s.zeroAtivos})</span></td>
              <td class="py-1.5 px-1.5 text-right text-orange-500">${formatBR(s.baixoPct, 1)}%</td>
              <td class="py-1.5 px-1.5 text-right text-emerald-500 font-bold">${formatBR(s.eficPct, 1)}%</td>
            </tr>
          `).join("");
        }
      }

      const ctxTrend = document.getElementById("chartMonthlyTrend");
      if (ctxTrend && window.Chart) {
        if (chartMonthlyTrendInstance) chartMonthlyTrendInstance.destroy();
        const isDark = document.documentElement.classList.contains("dark");
        const textColor = isDark ? "#e2e8f0" : "#334155";

        chartMonthlyTrendInstance = new Chart(ctxTrend, {
          type: "line",
          data: {
            labels: snaps.map(s => s.dateLabel),
            datasets: [
              {
                label: "Giro Zero (%)",
                data: snaps.map(s => +(s.zeroPct || 0).toFixed(2)),
                borderColor: "#ef4444",
                backgroundColor: "rgba(239, 68, 68, 0.15)",
                tension: 0.3,
                fill: true,
                pointRadius: 4
              },
              {
                label: "Giro Eficiente (%)",
                data: snaps.map(s => +(s.eficPct || 0).toFixed(2)),
                borderColor: "#10b981",
                backgroundColor: "rgba(16, 185, 129, 0.1)",
                tension: 0.3,
                fill: false,
                pointRadius: 4
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              x: { ticks: { color: textColor, font: { size: 10 } } },
              y: { beginAtZero: true, ticks: { color: textColor, callback: v => v + "%" } }
            },
            plugins: {
              legend: {
                position: "bottom",
                labels: { color: textColor, font: { family: "Inter", weight: "bold", size: 11 } }
              }
            }
          }
        });
      }

      // Renderiza Tabela Nominal de Transições
      const tbody = document.getElementById("periodTransitionsBody");
      if (!tbody) return;

      let rowsToShow = scoped;
      if (filterTrans === "MOVED_ONLY") {
        rowsToShow = scoped.filter(c => getStartStatus(c) !== c.statusGiro || c.vendaInformada);
      } else if (filterTrans === "LEFT_ZERO") {
        rowsToShow = scoped.filter(c => getStartStatus(c) === "GIRO ZERO" && c.statusGiro !== "GIRO ZERO");
      } else if (filterTrans === "TO_EFICIENTE") {
        rowsToShow = scoped.filter(c => getStartStatus(c) !== "GIRO EFICIENTE" && c.statusGiro === "GIRO EFICIENTE");
      }

      if (rowsToShow.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="p-6 text-center text-slate-500">Nenhuma transição encontrada para este filtro no período selecionado. Mude o filtro acima para "Mostrar Todos os Clientes" se desejar ver a base inteira.</td></tr>`;
        return;
      }

      tbody.innerHTML = rowsToShow.map(c => {
        const pStatus = getStartStatus(c);
        const pHL = getStartHL(c);
        const diffHL = (c.realHL || 0) - pHL;

        let badge = `<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 dark:bg-white/10 text-slate-500">Manteve Faixa</span>`;
        if (pStatus === "GIRO ZERO" && c.statusGiro === "GIRO EFICIENTE") {
          badge = `<span class="px-2 py-0.5 rounded text-[11px] font-extrabold bg-emerald-500/20 text-emerald-500">🚀 Giro Zero → Giro Eficiente!</span>`;
        } else if (pStatus === "GIRO ZERO" && c.statusGiro === "BAIXO DESEMPENHO") {
          badge = `<span class="px-2 py-0.5 rounded text-[11px] font-extrabold bg-sky-500/20 text-sky-400">↗ Giro Zero → Baixo Desempenho</span>`;
        } else if (pStatus === "BAIXO DESEMPENHO" && c.statusGiro === "GIRO EFICIENTE") {
          badge = `<span class="px-2 py-0.5 rounded text-[11px] font-extrabold bg-teal-500/20 text-teal-400">✅ Baixo Des. → Giro Eficiente</span>`;
        } else if (c.vendaInformada) {
          badge = `<span class="px-2 py-0.5 rounded text-[11px] font-extrabold bg-amber-400 text-slate-950">🟡 Venda Informada (+${c.vendaCaixas} cx)</span>`;
        } else if (pStatus !== "GIRO ZERO" && c.statusGiro === "GIRO ZERO") {
          badge = `<span class="px-2 py-0.5 rounded text-[11px] font-extrabold bg-red-500/20 text-red-400">↘ Regrediu p/ Giro Zero</span>`;
        }

        return `
        <tr>
          <td class="py-2 px-3 font-mono font-bold">${c.idCliente}</td>
          <td class="py-2 px-3 font-bold">${c.cliente}</td>
          <td class="py-2 px-3">Setor ${c.setorId} <span class="text-[10px] text-slate-400">(Mesa ${c.supId})</span></td>
          <td class="py-2 px-3 text-center font-mono font-bold">${c.ativos}</td>
          <td class="py-2 px-3">${getStatusBadgeHTML(pStatus)}</td>
          <td class="py-2 px-3">${getStatusBadgeHTML(c.statusGiro)}</td>
          <td class="py-2 px-3 text-right font-mono font-bold ${diffHL >= 0 ? 'text-emerald-500' : 'text-red-500'}">
            ${formatBR(pHL, 2)} → ${formatBR(c.realHL, 2)} HL (${diffHL >= 0 ? '+' : ''}${formatBR(diffHL, 2)})
          </td>
          <td class="py-2 px-3">${badge}</td>
        </tr>`;
      }).join("");
    }

    function resetMonthlyCycle() {
      // Ao virar o mês, fixa o status atual de cada cliente como o novo ponto de partida do mês e limpa os snapshots do mês anterior
      state.clients.forEach(c => {
        c.monthStartStatus = c.statusGiro;
        c.monthStartHL = c.realHL;
        c.prevStatus = c.statusGiro;
        c.prevHL = c.realHL;
        c.saidaConfirmada = false;
      });
      state.dailySnapshots = [];
      state.alerts = [];
      recordDailySnapshot();
      saveState(true);
      renderAll();
      showToast("Novo ciclo mensal iniciado! Histórico anterior limpo para não sobrecarregar.", "success");
    }

    function recordDailySnapshot(customDateLabel) {
      const valid = state.clients.filter(c => !isClientExpurgado(c));
      if (valid.length === 0) return;

      const sumAtivos = list => list.reduce((a, b) => a + (parseInt(b.ativos) || 1), 0);
      const totAtivos = sumAtivos(valid);
      const zAtivos = sumAtivos(valid.filter(c => c.statusGiro === "GIRO ZERO"));
      const bAtivos = sumAtivos(valid.filter(c => c.statusGiro === "BAIXO DESEMPENHO"));
      const eAtivos = sumAtivos(valid.filter(c => c.statusGiro === "GIRO EFICIENTE"));

      const now = new Date();
      const shortDate = customDateLabel || now.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

      const snap = {
        dateLabel: shortDate,
        totalClients: valid.length,
        totalAtivos: totAtivos,
        zeroAtivos: zAtivos,
        baixoAtivos: bAtivos,
        eficAtivos: eAtivos,
        zeroPct: totAtivos > 0 ? +((zAtivos / totAtivos) * 100).toFixed(2) : 0,
        baixoPct: totAtivos > 0 ? +((bAtivos / totAtivos) * 100).toFixed(2) : 0,
        eficPct: totAtivos > 0 ? +((eAtivos / totAtivos) * 100).toFixed(2) : 0
      };

      if (!Array.isArray(state.dailySnapshots)) state.dailySnapshots = [];
      const existingIdx = state.dailySnapshots.findIndex(s => s.dateLabel === shortDate);
      if (existingIdx >= 0) {
        state.dailySnapshots[existingIdx] = snap;
      } else {
        state.dailySnapshots.push(snap);
      }
      // Mantém no máximo 35 dias no mês para nunca sobrecarregar a nuvem
      if (state.dailySnapshots.length > 35) {
        state.dailySnapshots = state.dailySnapshots.slice(state.dailySnapshots.length - 35);
      }
    }

    // =========================================================================
    // 11. PARSER INTELIGENTE DO EXCEL (NÃO EMBARALHA COLUNAS NEM EXPURGOS!)
    // =========================================================================
    function parseBRFloat(val) {
      if (typeof val === "number") return val;
      const clean = String(val || "0").replace(/\s/g, "").replace(/\./g, "").replace(",", ".").replace("%", "").trim();
      const num = parseFloat(clean);
      return isNaN(num) ? 0 : num;
    }

    function normalizeHeader(str) {
      return String(str || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9%]/g, " ")
        .trim();
    }

    function parseRawExcelText(rawText) {
      const rawLines = rawText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
      const parsed = [];

      let colMap = {
        mes: 0,
        regional: 1,
        idCentro: 2,
        idOrg: 3,
        operacao: 4,
        statusGiro: 5,
        matriz: 6,
        idCliente: 7,
        cliente: 8,
        cnpj: 9,
        idGrupo: 10,
        grupo: 11,
        categoria: 12,
        supId: 13,
        supNome: 14,
        setorId: 15,
        vendedorNome: 16,
        ativos: 17,
        realHL: 18,
        metaHL: 19,
        retornoPct: 20,
        unir: 21,
        expurgado: 22
      };

      for (let idx = 0; idx < rawLines.length; idx++) {
        const line = rawLines[idx];
        if (!line || !line.trim()) continue;

        const sep = line.includes("\t") ? "\t" : (line.includes(";") ? ";" : "\t");
        const cols = line.split(sep).map(c => c.trim());
        if (cols.length < 6) continue;

        const joinedNorm = normalizeHeader(cols.join(" "));
        if (
          joinedNorm.includes("status giro") ||
          joinedNorm.includes("id cliente") ||
          joinedNorm.includes("ativos em campo") ||
          (idx === 0 && (joinedNorm.startsWith("mes ") || joinedNorm.includes("organizacao de vendas")))
        ) {
          cols.forEach((colName, cIdx) => {
            const h = normalizeHeader(colName);
            if (h === "mes") colMap.mes = cIdx;
            else if (h.includes("regional")) colMap.regional = cIdx;
            else if (h.includes("id centro")) colMap.idCentro = cIdx;
            else if (h.includes("organizacao")) colMap.idOrg = cIdx;
            else if (h.includes("operacao")) colMap.operacao = cIdx;
            else if (h.includes("status giro") || h === "status") colMap.statusGiro = cIdx;
            else if (h.includes("matriz")) colMap.matriz = cIdx;
            else if (h === "id cliente" || h === "codigo cliente" || h === "cod cliente") colMap.idCliente = cIdx;
            else if (h === "cliente" || h === "nome cliente") colMap.cliente = cIdx;
            else if (h.includes("cnpj") || h.includes("cpf")) colMap.cnpj = cIdx;
            else if (h.includes("id grupo")) colMap.idGrupo = cIdx;
            else if (h === "grupo de clientes" || h === "grupo") colMap.grupo = cIdx;
            else if (h.includes("categoria")) colMap.categoria = cIdx;
            else if (h === "supervisor vendas" || h === "id supervisor" || h === "mesa") colMap.supId = cIdx;
            else if (h.includes("desc") && h.includes("sup")) colMap.supNome = cIdx;
            else if (h === "setor de vendas" || h === "setor" || h === "id setor") colMap.setorId = cIdx;
            else if (h.includes("desc") && h.includes("setor")) colMap.vendedorNome = cIdx;
            else if (h.includes("ativos")) colMap.ativos = cIdx;
            else if (h.includes("real hl") || h === "real") colMap.realHL = cIdx;
            else if (h.includes("meta hl") || h === "meta") colMap.metaHL = cIdx;
            else if (h.includes("retorno")) colMap.retornoPct = cIdx;
            else if (h === "unir") colMap.unir = cIdx;
            else if (h.includes("expurgado") || h.includes("expurgo")) colMap.expurgado = cIdx;
          });
          continue;
        }

        let rawStatus = (cols[colMap.statusGiro] || "").toUpperCase().trim();
        let offset = 0;
        if (!rawStatus.includes("GIRO") && !rawStatus.includes("BAIXO") && !rawStatus.includes("ZERO") && !rawStatus.includes("EFICIENTE")) {
          const foundStatusIdx = cols.findIndex(c => {
            const u = c.toUpperCase();
            return u.includes("GIRO ZERO") || u.includes("BAIXO DESEMPENHO") || u.includes("GIRO EFICIENTE");
          });
          if (foundStatusIdx >= 0) {
            offset = foundStatusIdx - colMap.statusGiro;
            rawStatus = cols[foundStatusIdx].toUpperCase().trim();
          }
        }

        const getCol = key => cols[colMap[key] + offset] !== undefined ? cols[colMap[key] + offset].trim() : "";

        let statusGiro = "BAIXO DESEMPENHO";
        if (rawStatus.includes("ZERO")) statusGiro = "GIRO ZERO";
        else if (rawStatus.includes("EFICIENTE")) statusGiro = "GIRO EFICIENTE";
        else if (rawStatus.includes("BAIXO")) statusGiro = "BAIXO DESEMPENHO";

        const idCliente = String(getCol("idCliente") || "").trim();
        if (!idCliente) continue;

        const ativos = Math.max(1, parseInt(getCol("ativos")) || 1);
        const realHL = parseBRFloat(getCol("realHL"));
        const metaHL = parseBRFloat(getCol("metaHL")) || (ativos * 2.0);
        const retornoPct = parseBRFloat(getCol("retornoPct")) || (metaHL > 0 ? Math.round((realHL / metaHL) * 100) : 0);

        let expVal = getCol("expurgado").toUpperCase();
        if (expVal !== "SIM" && expVal !== "NAO" && expVal !== "NÃO" && expVal !== "S" && expVal !== "N") {
          for (let k = cols.length - 1; k >= Math.max(0, cols.length - 3); k--) {
            const tail = cols[k].toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
            if (tail === "SIM" || tail === "NAO" || tail === "EXPURGADO") {
              expVal = tail === "EXPURGADO" ? "SIM" : tail;
              break;
            }
          }
        }
        const expurgadoClean = (expVal === "SIM" || expVal === "S") ? "SIM" : "NAO";

        parsed.push({
          mes: getCol("mes") || "Nov",
          regional: getCol("regional") || "DIR REG NORDESTE N",
          idCentro: getCol("idCentro") || "0026",
          idOrg: getCol("idOrg") || "5087",
          operacao: getCol("operacao") || "CDA BENEVIDES",
          statusGiro,
          matriz: (getCol("matriz") || "BRONZE").toUpperCase(),
          idCliente,
          cliente: getCol("cliente") || "Cliente",
          cnpj: String(getCol("cnpj") || ""),
          idGrupo: getCol("idGrupo") || "",
          grupo: getCol("grupo") || "",
          categoria: getCol("categoria") || "Tradicional",
          supId: String(getCol("supId") || "").trim(),
          supNome: getCol("supNome") || "",
          setorId: String(getCol("setorId") || "").trim(),
          vendedorNome: getCol("vendedorNome") || "",
          ativos,
          realHL,
          metaHL,
          retornoPct,
          unir: getCol("unir") || "",
          expurgado: expurgadoClean
        });
      }

      return parsed;
    }

    function previewExcelPaste() {
      const raw = document.getElementById("excelPasteTextarea").value;
      const box = document.getElementById("pastePreviewBox");
      if (!raw.trim()) {
        showToast("Cole as linhas copiadas do Excel primeiro!", "warning");
        return;
      }

      const rows = parseRawExcelText(raw);
      state.pendingPasteRows = rows;
      box.classList.remove("hidden");

      if (rows.length === 0) {
        box.innerHTML = `<p class="text-red-500 font-bold">Nenhuma linha válida identificada. Certifique-se de copiar as linhas direto do Excel (Ctrl+C / Ctrl+V).</p>`;
        return;
      }

      const validRows = rows.filter(r => r.expurgado !== "SIM");
      const expRows = rows.filter(r => r.expurgado === "SIM");

      const sumAtivos = list => list.reduce((a, b) => a + (parseInt(b.ativos) || 1), 0);
      const totValidAtivos = sumAtivos(validRows);
      const zeroValidRows = validRows.filter(r => r.statusGiro === "GIRO ZERO");
      const zeroValidAtivos = sumAtivos(zeroValidRows);

      const pctZeroByAtivos = totValidAtivos > 0 ? formatBR((zeroValidAtivos / totValidAtivos) * 100, 2) : "0,00";
      const pctZeroByClients = validRows.length > 0 ? formatBR((zeroValidRows.length / validRows.length) * 100, 2) : "0,00";

      const uniqueMesas = new Set(validRows.map(r => r.supId).filter(Boolean)).size;
      const uniqueSetores = new Set(validRows.map(r => r.setorId).filter(Boolean)).size;

      box.innerHTML = `
        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-white/10 pb-2">
          <span class="font-extrabold text-emerald-600 dark:text-emerald-400">
            ✓ ${rows.length} linhas lidas (${validRows.length} Válidas c/ EXPURGADO=NÃO | ${expRows.length} Expurgadas c/ SIM ignoradas)
          </span>
          <span class="text-[11px] font-mono">Mesas: <b>${uniqueMesas}</b> | Setores: <b>${uniqueSetores}</b></span>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 font-mono text-[11px]">
          <div class="p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-300">
            <b>Giro Zero (Por Ativos em Campo):</b> ${pctZeroByAtivos}% (${zeroValidAtivos} de ${totValidAtivos} ativos)
          </div>
          <div class="p-2 rounded-lg bg-slate-200/60 dark:bg-white/5 text-slate-700 dark:text-slate-300">
            <b>Giro Zero (Por Qtd. Clientes):</b> ${pctZeroByClients}% (${zeroValidRows.length} de ${validRows.length} clientes)
          </div>
        </div>
        <p class="text-[11px] text-slate-500">Clique em "2. Publicar na Nuvem & Atualizar Mês" para gravar e enviar a todos os celulares.</p>
      `;
    }

    function publishExcelPaste() {
      const raw = document.getElementById("excelPasteTextarea").value;
      const rows = state.pendingPasteRows.length > 0 ? state.pendingPasteRows : parseRawExcelText(raw);
      if (rows.length === 0) {
        showToast("Nenhuma linha válida para publicar. Cole os dados do Excel primeiro.", "warning");
        return;
      }

      const replaceEntire = document.getElementById("chkReplaceEntireBase")?.checked;
      let salidasConfirmadas = 0;
      let saíramDoZeroHoje = 0;

      if (replaceEntire) {
        const oldMap = new Map(state.clients.map(c => [String(c.idCliente), c]));
        state.clients = rows.map(r => {
          const old = oldMap.get(String(r.idCliente));
          if (old) {
            const becameEfficient = old.statusGiro !== "GIRO EFICIENTE" && r.statusGiro === "GIRO EFICIENTE";
            const leftZero = old.statusGiro === "GIRO ZERO" && r.statusGiro !== "GIRO ZERO";
            if (becameEfficient) salidasConfirmadas++;
            if (leftZero) saíramDoZeroHoje++;

            return Object.assign({}, old, r, {
              // Preserva o status de início do mês (monthStartStatus) para o comparativo mensal!
              monthStartStatus: old.monthStartStatus || old.statusGiro,
              monthStartHL: typeof old.monthStartHL === "number" ? old.monthStartHL : old.realHL,
              prevStatus: old.statusGiro,
              prevHL: old.realHL,
              saidaConfirmada: becameEfficient || leftZero || old.saidaConfirmada,
              vendaInformada: (becameEfficient || leftZero) ? false : old.vendaInformada
            });
          }
          return Object.assign({}, r, {
            monthStartStatus: r.statusGiro,
            monthStartHL: r.realHL,
            prevStatus: r.statusGiro,
            prevHL: r.realHL,
            vendaInformada: false,
            vendaCaixas: 0,
            vendaObs: "",
            vendaAutor: "",
            vendaData: "",
            saidaConfirmada: false
          });
        });
      } else {
        rows.forEach(r => {
          const idx = state.clients.findIndex(c => String(c.idCliente) === String(r.idCliente));
          if (idx >= 0) {
            const old = state.clients[idx];
            const becameEfficient = old.statusGiro !== "GIRO EFICIENTE" && r.statusGiro === "GIRO EFICIENTE";
            const leftZero = old.statusGiro === "GIRO ZERO" && r.statusGiro !== "GIRO ZERO";
            if (becameEfficient) salidasConfirmadas++;
            if (leftZero) saíramDoZeroHoje++;

            state.clients[idx] = Object.assign({}, old, r, {
              monthStartStatus: old.monthStartStatus || old.statusGiro,
              monthStartHL: typeof old.monthStartHL === "number" ? old.monthStartHL : old.realHL,
              prevStatus: old.statusGiro,
              prevHL: old.realHL,
              saidaConfirmada: becameEfficient || leftZero || old.saidaConfirmada,
              vendaInformada: (becameEfficient || leftZero) ? false : old.vendaInformada
            });
          } else {
            state.clients.push(Object.assign({}, r, {
              monthStartStatus: r.statusGiro,
              monthStartHL: r.realHL,
              prevStatus: r.statusGiro,
              prevHL: r.realHL,
              vendaInformada: false,
              vendaCaixas: 0,
              vendaObs: "",
              vendaAutor: "",
              vendaData: "",
              saidaConfirmada: false
            }));
          }
        });
      }

      const validCount = state.clients.filter(c => !isClientExpurgado(c)).length;
      const expCount = state.clients.length - validCount;

      const now = new Date();
      const dateBR = now.toLocaleDateString("pt-BR");
      const timeBR = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      const customStamp = (document.getElementById("inputCustomUpdateStamp")?.value || "").trim();

      state.lastUpdateDateISO = dateBR;
      state.lastUpdateLabel = customStamp || `Hoje (${dateBR}) às ${timeBR} (${validCount} válidos • ${expCount} expurgos)`;
      state.pendingPasteRows = [];
      document.getElementById("excelPasteTextarea").value = "";

      // Registra o ponto diário na série histórica do mês para o gráfico e projeções
      recordDailySnapshot(customStamp ? customStamp.slice(0, 5) : undefined);

      if (salidasConfirmadas > 0 || saíramDoZeroHoje > 0) {
        state.alerts.unshift({
          id: "al_" + Date.now(),
          type: "SAIDA_CONFIRMADA",
          title: `🎉 Evolução do Dia: ${saíramDoZeroHoje} saíram do Zero | ${salidasConfirmadas} p/ Eficiente!`,
          desc: `Atualização de ${dateBR} às ${timeBR} registrada na série do mês e enviada para a nuvem.`,
          time: `${dateBR} ${timeBR}`,
          read: false,
          clientId: ""
        });
        playBeepSound("confirm");
      } else {
        playBeepSound("yellow");
      }

      saveState(true);
      syncFilterDropdownsWithRole();
      renderAll();
      showToast(`Planilha publicada na Nuvem e histórico mensal atualizado!`, "success");
    }

    function clearAllDatabaseData() {
      state.clients = [];
      state.dailySnapshots = [];
      state.alerts = [];
      state.lastUpdateLabel = "Base limpa — Aguardando nova colagem";
      state.lastUpdateDateISO = "";
      saveState(true);
      syncFilterDropdownsWithRole();
      renderAll();
      showToast("Todos os registros da base foram limpos!", "info");
    }

    // =========================================================================
    // 12. GERADOR DE HTML COM NUVEM E SENHA EMBUTIDAS (E SEM SESSÃO LOGADA!)
    // =========================================================================
    function buildPrecompiledHTMLString() {
      // NUNCA embute activeSetorId, activeSupId ou loggedIn! Assim cada celular abre na tela de login limpa!
      const embeddedObj = {
        adminPass: state.adminPass || "0026",
        sellerPassMode: state.sellerPassMode || "SAME_AS_SETOR",
        sellerKeyword: state.sellerKeyword || "",
        supPassMode: state.supPassMode || "SAME_AS_MESA",
        supKeyword: state.supKeyword || "",
        calcMetricMode: state.calcMetricMode || "ATIVOS",
        boxFactorHL: state.boxFactorHL || 0.0396,
        lastUpdateLabel: state.lastUpdateLabel,
        lastUpdateDateISO: state.lastUpdateDateISO,
        cloudWebhookUrl: state.cloudWebhookUrl || "",
        clients: state.clients,
        dailySnapshots: state.dailySnapshots,
        alerts: state.alerts
      };
      const replacement = `/*__EMBEDDED_STATE_START__*/\n    const EMBEDDED_DEFAULT_STATE = ${JSON.stringify(embeddedObj)};\n    /*__EMBEDDED_STATE_END__*/`;
      const fullHTML = "<!DOCTYPE html>\n" + document.documentElement.outerHTML;
      return fullHTML.replace(/\/\*__EMBEDDED_STATE_START__\*\/[\s\S]*?\/\*__EMBEDDED_STATE_END__\*\//, replacement);
    }

    function exportPrecompiledHTML() {
      const htmlStr = buildPrecompiledHTMLString();
      const blob = new Blob([htmlStr], { type: "text/html;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Giro_Em_Foco_CDA_Benevides_Nuvem.html";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast("Arquivo HTML baixado com Nuvem, Senha e Base gravadas (e login individual por celular)!", "success");
    }

    function selectGeneratedHtmlBox() {
      const box = document.getElementById("generatedHtmlOutputBox");
      if (!box) return;
      box.focus();
      box.select();
      box.setSelectionRange(0, box.value.length);
      try { document.execCommand("copy"); } catch (e) {}
      showToast("Texto selecionado! Aperte Ctrl+C no seu teclado.", "success");
    }

    function copyPrecompiledHTMLToClipboard() {
      const htmlStr = buildPrecompiledHTMLString();
      const wrap = document.getElementById("generatedHtmlCopyBoxWrapper");
      const box = document.getElementById("generatedHtmlOutputBox");
      if (wrap && box) {
        wrap.classList.remove("hidden");
        box.value = htmlStr;
        box.focus();
        box.select();
        box.setSelectionRange(0, box.value.length);
      }
      let copied = false;
      try {
        copied = document.execCommand("copy");
      } catch (e) {}
      if (!copied && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(htmlStr).catch(() => {});
      }
      showToast("Código pronto e selecionado na caixa abaixo! Aperte Ctrl+C para garantir e cole no Google Sites.", "success");
    }

    function saveCloudWebhookConnection() {
      const url = (document.getElementById("inputCloudWebhookUrl").value || "").trim();
      const msg = document.getElementById("cloudStatusMsg");
      if (!url) {
        showToast("Cole a URL do seu Google Apps Script (.../exec) primeiro!", "warning");
        return;
      }
      state.cloudWebhookUrl = url;
      saveState(true);
      if (msg) {
        msg.textContent = `Conectado à Nuvem Google (${url.slice(0, 48)}...)! Agora clique no Passo 3 abaixo para copiar o HTML final para o seu Google Sites.`;
        msg.className = "text-[11px] text-emerald-500 font-bold";
      }
      showToast("URL da Nuvem Google salva e sincronizada!", "success");
    }

    function copyGoogleAppsScriptCode() {
      const text = document.getElementById("googleAppsScriptBlock").textContent;
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      let ok = false;
      try { ok = document.execCommand("copy"); } catch (e) {}
      document.body.removeChild(ta);
      if (!ok && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).catch(() => {});
      }
      showToast("Código do Google Apps Script copiado!", "success");
    }

    // =========================================================================
    // 13. EDIÇÃO E EXCLUSÃO DE CLIENTES / ACOMPANHAMENTOS
    // =========================================================================
    function openEditClientModal(idCliente) {
      const c = state.clients.find(item => String(item.idCliente) === String(idCliente));
      if (!c) return;

      document.getElementById("editModalTitle").textContent = `Editar Cliente #${c.idCliente}`;
      document.getElementById("editIdCliente").value = c.idCliente;
      document.getElementById("editIdCliente").readOnly = true;
      document.getElementById("editNomeCliente").value = c.cliente;
      document.getElementById("editCnpj").value = c.cnpj;
      document.getElementById("editStatusGiro").value = c.statusGiro;
      document.getElementById("editMatriz").value = c.matriz || "BRONZE";
      document.getElementById("editCategoria").value = c.categoria || "Tradicional";
      document.getElementById("editGrupo").value = c.grupo || "Armazém/Mercearia";
      document.getElementById("editAtivos").value = String(c.ativos || 1);
      document.getElementById("editRealHL").value = String(c.realHL || 0);
      document.getElementById("editMetaHL").value = String(c.metaHL || 2);
      document.getElementById("editExpurgado").value = c.expurgado || "NAO";
      document.getElementById("editSetorIdInput").value = c.setorId || "";
      document.getElementById("editVendedorNomeInput").value = c.vendedorNome || "";
      document.getElementById("editSupIdInput").value = c.supId || "";
      document.getElementById("btnDeleteClientModal").classList.remove("hidden");

      document.getElementById("modalEditClient").classList.remove("hidden");
    }

    function openAddClientModal() {
      document.getElementById("editModalTitle").textContent = "Novo Cliente Manual";
      document.getElementById("editIdCliente").value = "";
      document.getElementById("editIdCliente").readOnly = false;
      document.getElementById("editNomeCliente").value = "";
      document.getElementById("editCnpj").value = "";
      document.getElementById("editStatusGiro").value = "BAIXO DESEMPENHO";
      document.getElementById("editMatriz").value = "BRONZE";
      document.getElementById("editCategoria").value = "Tradicional";
      document.getElementById("editGrupo").value = "Armazém/Mercearia";
      document.getElementById("editAtivos").value = "1";
      document.getElementById("editRealHL").value = "0.00";
      document.getElementById("editMetaHL").value = "2.0";
      document.getElementById("editExpurgado").value = "NAO";
      document.getElementById("editSetorIdInput").value = "";
      document.getElementById("editVendedorNomeInput").value = "";
      document.getElementById("editSupIdInput").value = "";
      document.getElementById("btnDeleteClientModal").classList.add("hidden");

      document.getElementById("modalEditClient").classList.remove("hidden");
    }

    function closeEditClientModal() {
      document.getElementById("modalEditClient").classList.add("hidden");
    }

    function saveEditedClient() {
      const idCliente = (document.getElementById("editIdCliente").value || "").trim();
      const nome = (document.getElementById("editNomeCliente").value || "").trim();
      const setorId = (document.getElementById("editSetorIdInput").value || "").trim();
      const supId = (document.getElementById("editSupIdInput").value || "").trim();

      if (!idCliente || !nome || !setorId) {
        showToast("Informe pelo menos ID do Cliente, Nome e Setor!", "warning");
        return;
      }

      const realHL = parseFloat(document.getElementById("editRealHL").value) || 0;
      const metaHL = parseFloat(document.getElementById("editMetaHL").value) || 2;
      const retornoPct = metaHL > 0 ? Math.round((realHL / metaHL) * 100) : 0;

      const idx = state.clients.findIndex(c => String(c.idCliente) === String(idCliente));
      const payload = {
        mes: "Nov",
        regional: "DIR REG NORDESTE N",
        idCentro: "0026",
        idOrg: "5087",
        operacao: "CDA BENEVIDES",
        statusGiro: document.getElementById("editStatusGiro").value,
        matriz: document.getElementById("editMatriz").value,
        idCliente,
        cliente: nome,
        cnpj: document.getElementById("editCnpj").value,
        idGrupo: "B4",
        grupo: document.getElementById("editGrupo").value,
        categoria: document.getElementById("editCategoria").value,
        supId: supId || "Geral",
        supNome: supId ? `Mesa ${supId}` : "Geral",
        setorId,
        vendedorNome: (document.getElementById("editVendedorNomeInput").value || "").trim() || `Setor ${setorId}`,
        ativos: parseInt(document.getElementById("editAtivos").value) || 1,
        realHL,
        metaHL,
        retornoPct,
        unir: "",
        expurgado: document.getElementById("editExpurgado").value
      };

      if (idx >= 0) {
        state.clients[idx] = Object.assign({}, state.clients[idx], payload);
      } else {
        state.clients.unshift(Object.assign({}, payload, {
          monthStartStatus: payload.statusGiro,
          monthStartHL: payload.realHL,
          prevStatus: payload.statusGiro,
          prevHL: payload.realHL,
          vendaInformada: false,
          vendaCaixas: 0,
          vendaObs: "",
          vendaAutor: "",
          vendaData: "",
          saidaConfirmada: payload.statusGiro === "GIRO EFICIENTE"
        }));
      }

      saveState(true);
      closeEditClientModal();
      syncFilterDropdownsWithRole();
      renderAll();
      showToast(`Registro do cliente ${nome} salvo e sincronizado!`, "success");
    }

    function deleteCurrentClientFromModal() {
      const idCliente = document.getElementById("editIdCliente").value;
      state.clients = state.clients.filter(c => String(c.idCliente) !== String(idCliente));
      saveState(true);
      closeEditClientModal();
      renderAll();
      showToast(`Cliente #${idCliente} removido.`, "info");
    }

    // =========================================================================
    // 14. DRAWER DE NOTIFICAÇÕES, EXPORTAÇÃO EXCEL E TEMA CLARO/ESCURO
    // =========================================================================
    function toggleNotificationDrawer() {
      const dr = document.getElementById("drawerNotifications");
      dr.classList.toggle("translate-x-full");
      renderNotificationsDrawer();
    }

    function renderNotificationsDrawer() {
      const listEl = document.getElementById("notificationsList");
      const countEl = document.getElementById("drawerAlertCountText");
      if (!listEl) return;

      const scopedAlerts = getScopedAlerts();
      countEl.textContent = `${scopedAlerts.length} alerta(s) na sua visão`;
      if (scopedAlerts.length === 0) {
        listEl.innerHTML = `<p class="text-xs text-slate-500 text-center py-8">Nenhuma notificação até o momento.</p>`;
        return;
      }

      listEl.innerHTML = scopedAlerts.map(a => {
        const isConfirm = a.type === "SAIDA_CONFIRMADA";
        const border = isConfirm ? "border-emerald-500/40 bg-emerald-500/10" : "border-amber-400/50 bg-amber-500/10";
        return `
        <div class="p-3 rounded-xl border ${border} space-y-1">
          <div class="flex items-center justify-between gap-2">
            <span class="text-xs font-extrabold ${isConfirm ? 'text-emerald-600 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'}">${a.title}</span>
            <span class="text-[10px] font-mono text-slate-400 shrink-0">${a.time}</span>
          </div>
          <p class="text-xs text-slate-700 dark:text-slate-300">${a.desc}</p>
        </div>`;
      }).join("");
    }

    function markAllAlertsRead() {
      state.alerts.forEach(a => { a.read = true; });
      saveState(false);
      updateHeaderControls();
      renderNotificationsDrawer();
      showToast("Alertas marcados como lidos.", "info");
    }

    function exportCurrentViewTSV() {
      const list = getFilteredClients();
      if (list.length === 0) {
        showToast("Não há clientes na visão atual para exportar.", "warning");
        return;
      }
      const headers = [
        "Mês", "Regional", "ID Centro", "ID Organização de vendas", "Operação",
        "Status Início Mês", "Status Giro Atual", "Matriz Potencial", "ID Cliente", "Cliente", "CNPJ/CPF",
        "ID Grupo de clientes", "Grupo de clientes", "Categoria de Cliente",
        "Supervisor Vendas", "Desc. Sup. Vendas", "Setor de Vendas", "Desc. Setor de Vendas",
        "Ativos em Campo", "Real HL", "Meta HL", "Retorno %", "Falta Caixas", "Venda Informada (Amarelo)", "EXPURGADO"
      ];

      const lines = [headers.join("\t")];
      list.forEach(c => {
        const m = calcClientMetrics(c);
        lines.push([
          c.mes, c.regional, c.idCentro, c.idOrg, c.operacao,
          c.monthStartStatus || c.statusGiro, c.statusGiro, c.matriz, c.idCliente, c.cliente, c.cnpj,
          c.idGrupo, c.grupo, c.categoria,
          c.supId, c.supNome, c.setorId, c.vendedorNome,
          c.ativos, formatBR(c.realHL, 2), formatBR(c.metaHL, 1), `${c.retornoPct}%`,
          m.faltaCaixas, c.vendaInformada ? `SIM (${c.vendaCaixas} cx)` : "NAO", c.expurgado || "NAO"
        ].join("\t"));
      });

      const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/tab-separated-values;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Giro_Em_Foco_CDA_Benevides_${list.length}_clientes.xls`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast(`Exportado ${list.length} clientes para Excel!`, "success");
    }

    function toggleTheme() {
      const html = document.documentElement;
      const isDark = html.classList.toggle("dark");
      try { localStorage.setItem("giro_theme_cda", isDark ? "dark" : "light"); } catch (e) {}
      const iconTheme = document.getElementById("iconTheme");
      if (iconTheme) {
        iconTheme.setAttribute("data-lucide", isDark ? "sun" : "moon");
      }
      if (window.lucide) lucide.createIcons();
      if (state.activeTab === "graficos") renderChartsAndRanking();
      if (state.activeTab === "periodo") renderPeriodAnalysis();
    }

    function switchMainTab(tab) {
      if ((tab === "admin" || tab === "deploy") && (!state.loggedIn || state.role !== "ADMIN" || !state.adminUnlocked)) {
        handleAdminGearClick(tab);
        return;
      }
      state.activeTab = tab;
      const views = {
        carteira: "viewCarteira",
        amarelos: "viewAmarelos",
        graficos: "viewGraficos",
        periodo: "viewPeriodo",
        admin: "viewAdmin",
        deploy: "viewDeploy"
      };
      const btns = {
        carteira: "tabBtnCarteira",
        amarelos: "tabBtnAmarelos",
        graficos: "tabBtnGraficos",
        periodo: "tabBtnPeriodo",
        admin: "tabBtnAdmin",
        deploy: "tabBtnDeploy"
      };

      Object.keys(views).forEach(k => {
        const el = document.getElementById(views[k]);
        const b = document.getElementById(btns[k]);
        if (el) {
          if (k === tab) el.classList.remove("hidden");
          else el.classList.add("hidden");
        }
        if (b && !b.classList.contains("hidden")) {
          if (k === tab) {
            b.className = "tab-btn px-3 py-1.5 rounded-lg text-xs sm:text-sm font-bold flex items-center gap-1.5 transition whitespace-nowrap bg-hnk-600 text-white shadow-sm";
          } else {
            b.className = "tab-btn px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold flex items-center gap-1.5 transition whitespace-nowrap text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5";
          }
        }
      });

      if (tab === "amarelos") renderYellowTab();
      if (tab === "graficos") renderChartsAndRanking();
      if (tab === "periodo") renderPeriodAnalysis();
      if (tab === "admin" || tab === "deploy") syncAdminFormControls();
      if (window.lucide) lucide.createIcons();
    }

    function showToast(message, type = "info") {
      const cont = document.getElementById("toastContainer");
      if (!cont) return;
      const colors = {
        success: "bg-emerald-600 text-white border-emerald-400",
        warning: "bg-amber-400 text-slate-950 border-amber-300",
        info: "bg-graphite-900 text-white border-white/20"
      };
      const div = document.createElement("div");
      div.className = `pointer-events-auto p-3 rounded-xl border shadow-xl text-xs font-extrabold flex items-center justify-between gap-2 transition-all ${colors[type] || colors.info}`;
      div.innerHTML = `<span>${message}</span>`;
      cont.appendChild(div);
      setTimeout(() => {
        div.style.opacity = "0";
        setTimeout(() => div.remove(), 250);
      }, 3400);
    }

    function renderAll() {
      updateHeaderControls();
      renderKpis();
      renderClientList();
      renderYellowTab();
      renderNotificationsDrawer();
      if (state.activeTab === "graficos") renderChartsAndRanking();
      if (state.activeTab === "periodo") renderPeriodAnalysis();
      if (window.lucide) lucide.createIcons();
    }

    // Inicialização
    window.addEventListener("DOMContentLoaded", () => {
      try {
        const savedTheme = localStorage.getItem("giro_theme_cda");
        if (savedTheme === "light") {
          document.documentElement.classList.remove("dark");
        }
      } catch (e) {}

      loadSavedState();
      pullStateFromGoogleCloud(false);
      syncFilterDropdownsWithRole();
      renderAll();
      if (!state.loggedIn) {
        openRoleModal();
      }
    });
  