(function () {
  const ENR = window.ENR = window.ENR || {};
  const config = window.ENR_CONFIG || {};

  function clone(value) {
    return typeof structuredClone === 'function'
      ? structuredClone(value)
      : JSON.parse(JSON.stringify(value));
  }

  async function request(path, options = {}) {
    const response = await fetch(`${config.API_BASE_URL || '/api'}${path}`, {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      },
      ...options
    });

    let payload = null;
    if (response.status !== 204) {
      try { payload = await response.json(); } catch (_) { payload = null; }
    }

    if (!response.ok) {
      const detail = payload?.error || payload?.message || `HTTP ${response.status}`;
      const error = new Error(detail);
      error.status = response.status;
      error.code = payload?.code || null;
      error.payload = payload;

      if (
        response.status === 401 &&
        !options.skipAuthRedirect &&
        !location.pathname.endsWith('/login.html')
      ) {
        ENR.clearSession?.();
        location.href = 'login.html';
      }

      throw error;
    }

    return payload;
  }

  function walkStrings(value, output = []) {
    if (value == null) return output;
    if (typeof value === 'string') output.push(value);
    else if (Array.isArray(value)) value.forEach(item => walkStrings(item, output));
    else if (typeof value === 'object') Object.values(value).forEach(item => walkStrings(item, output));
    return output;
  }

  function normalizeSession(data) {
    const user = data?.user || {};
    const context = data?.userContext?.user_context ?? data?.userContext ?? {};
    const strings = walkStrings(context).map(value => String(value).toUpperCase());
    const role =
      strings.find(value => value === 'ADMIN' || value.includes('\"ADMIN\"') || value.includes('NURSING_ADMIN') || value.includes('SUPER_ADMIN'))
        ? 'ADMIN'
        : (strings.find(value => value.includes('NURSE')) ? 'NURSE' : 'NURSE');

    const wardCode =
      context?.unit_code ??
      context?.ward_code ??
      context?.org_unit_code ??
      context?.current_unit_code ??
      null;

    const orgUnitId = Number(
      context?.org_unit_id ??
      context?.ward_org_unit_id ??
      context?.current_org_unit_id ??
      0
    ) || null;

    return {
      appUserId: Number(user.id || context?.app_user_id || 0) || null,
      username: user.username || '',
      displayName: user.full_name_th || user.username || 'ผู้ใช้งาน',
      employeeNo: user.employee_no || '',
      role,
      wardCode: wardCode == null ? null : String(wardCode),
      orgUnitId,
      mustChangePassword: Boolean(data?.mustChangePassword || user.must_change_password),
      authenticated: Boolean(data?.authenticated),
      serverContext: context,
      mock: false
    };
  }

  function normalizeWard(raw) {
    const row = raw || {};
    return {
      id: Number(row.id ?? row.org_unit_id ?? 0) || null,
      code: String(row.code ?? row.unit_code ?? row.org_unit_code ?? row.ward_code ?? ''),
      name: String(row.name ?? row.unit_name_th ?? row.org_unit_name_th ?? row.ward_name ?? row.name_th ?? 'หน่วยงาน'),
      type: String(row.type ?? row.unit_type ?? ''),
      is_active: row.is_active !== false,
      raw: row.raw || row
    };
  }

  function first(row, keys, fallback = '') {
    for (const key of keys) {
      const value = row?.[key];
      if (value !== undefined && value !== null && String(value).trim() !== '') return value;
    }
    return fallback;
  }

  function normalizePatient(row) {
    const encounterId = Number(first(row, [
      'encounter_id', 'patient_encounter_id', 'active_encounter_id', 'id'
    ], 0)) || null;

    const name = String(first(row, [
      'patient_name', 'full_name_th', 'patient_full_name', 'name_th',
      'full_name', 'display_name', 'name'
    ], 'ผู้ป่วย'));

    return {
      encounterId,
      encounter_id: encounterId,
      patientId: Number(first(row, ['patient_id'], 0)) || null,
      hn: String(first(row, ['hn', 'hospital_number', 'patient_hn'], '-')),
      an: String(first(row, ['an', 'admission_number', 'encounter_no', 'visit_no'], '-')),
      name,
      bed: String(first(row, ['bed_no', 'bed_number', 'bed', 'room_bed'], '-')),
      dx: String(first(row, [
        'principal_diagnosis', 'principal_diagnosis_text', 'diagnosis',
        'diagnosis_text', 'dx'
      ], '-')),
      admit: first(row, [
        'admit_datetime', 'admitted_at', 'admit_at', 'encounter_start_at',
        'admit_date'
      ], null),
      dc: first(row, [
        'discharge_datetime', 'discharged_at', 'discharge_at', 'encounter_end_at',
        'discharge_date'
      ], null),
      encounterType: String(first(row, ['encounter_type', 'encounterType', 'visit_type'], '-')).trim() || '-',
      encounter_type: String(first(row, ['encounter_type', 'encounterType', 'visit_type'], '-')).trim() || '-',
      orgUnitId: Number(first(row, ['org_unit_id', 'ward_org_unit_id'], 0)) || null,
      wardCode: String(first(row, ['unit_code', 'ward_code', 'org_unit_code'], '')),
      wardName: String(first(row, ['unit_name', 'unit_name_th', 'ward_name', 'org_unit_name'], '')),
      raw: row
    };
  }

  function normalizeTcnp(term) {
    const row = term || {};
    return {
      ...row,
      id: Number(row.id ?? row.code_id ?? 0) || null,
      code_id: Number(row.code_id ?? row.id ?? 0) || null,
      code: row.code ?? row.tcnp_code ?? '',
      code_type: row.code_type ?? (String(row.code || '').toUpperCase().startsWith('F') ? 'F' : 'P'),
      name_th: row.name_th ?? row.code_name_th ?? row.preferred_name_th ?? '',
      name_en: row.name_en ?? row.preferred_term ?? row.code_name_en ?? '',
      version: row.version ?? row.version_code ?? '1.8',
      action_code: row.action_code ?? '',
      type_source: row.type_source ?? ''
    };
  }

  function normalizeTemplate(template) {
    const t = clone(template || {});
    const items = t.items || t.template_items || t.sections || [];
    return {
      ...t,
      id: Number(t.id ?? t.template_id ?? 0) || null,
      code: t.code ?? t.template_code ?? '',
      name_th: t.name_th ?? t.template_name ?? '',
      name_en: t.name_en ?? '',
      description: t.description ?? '',
      version: Number(t.version ?? t.version_no ?? 1),
      status: t.status ?? t.review_status ?? 'DRAFT',
      scope_type: t.scope_type ?? 'HOSPITAL',
      org_unit_id: Number(t.org_unit_id ?? 0) || null,
      org_unit_code: t.org_unit_code ?? '',
      focus_code: t.focus_code ?? '',
      focus_text: t.focus_text ?? '',
      parent_template_id: Number(t.parent_template_id ?? 0) || null,
      usage_count: Number(t.usage_count ?? 0) || 0,
      has_usage: Boolean(t.has_usage ?? Number(t.usage_count ?? 0) > 0),
      items: Array.isArray(items) ? items.map((item, index) => ({
        ...item,
        id: Number(item.id ?? item.template_item_id ?? 0) || item.id || `ITEM-${index + 1}`,
        template_item_id: Number(item.template_item_id ?? item.id ?? 0) || null,
        code_id: Number(item.code_id ?? 0) || null,
        section_code: item.section_code,
        source_type: item.source_type ?? (item.code_id || item.tcnp_code ? 'TCNP' : 'MANUAL'),
        tcnp_code: item.tcnp_code ?? item.code ?? null,
        tcnp_name_th: item.tcnp_name_th ?? item.name_th ?? '',
        tcnp_name_en: item.tcnp_name_en ?? item.name_en ?? '',
        tcnp_version: item.tcnp_version ?? item.version ?? '',
        note_template: item.note_template ?? item.default_text ?? '',
        default_text: item.default_text ?? item.note_template ?? '',
        display_order: Number(item.display_order ?? index + 1),
        is_required: Boolean(item.is_required),
        allow_manual: item.allow_manual !== false,
        is_active: item.is_active !== false
      })) : []
    };
  }

  function normalizeNote(note) {
    const n = clone(note || {});
    const evalRow = n.latest_evaluation || n.evaluation || {};
    const items = n.items || n.note_items || [];
    return {
      ...n,
      id: Number(n.id ?? n.nursing_note_id ?? 0) || n.id,
      status: n.status ?? n.note_status ?? 'DRAFT',
      note_status: n.note_status ?? n.status ?? 'DRAFT',
      clinical_datetime: n.clinical_datetime,
      created_at: n.created_at,
      updated_at: n.updated_at,
      template_code: n.template_code ?? n.template_code_snapshot ?? null,
      template_version: n.template_version ?? n.template_version_no ?? null,
      created_by_display: n.created_by_display ?? n.created_by_name ?? n.created_by_username ?? '',
      signed_by_display: n.signed_by_display ?? n.signed_by_name ?? n.signed_by_username ?? '',
      cancelled_by_display: n.cancelled_by_display ?? n.cancelled_by_name ?? n.cancelled_by_username ?? '',
      evaluation_trend: n.evaluation_trend ?? evalRow.outcome_code ?? null,
      problem_status: n.problem_status ?? evalRow.status_code ?? 'IN_PROGRESS',
      evaluation_note: n.evaluation_note ?? evalRow.evaluation_text ?? '',
      patient_type_level: Number(n.patient_type_level ?? 0) || null,
      patientTypeLevel: Number(n.patient_type_level ?? n.patientTypeLevel ?? 0) || null,
      items: Array.isArray(items) ? items.map((item, index) => ({
        ...item,
        id: Number(item.id ?? 0) || item.id,
        source_template_item_id: Number(item.source_template_item_id ?? 0) || null,
        code_id: Number(item.code_id ?? 0) || null,
        section_code: item.section_code,
        source_type: item.source_type ?? (item.is_manual ? 'MANUAL' : 'TCNP'),
        tcnp_code: item.tcnp_code ?? item.code_snapshot ?? null,
        tcnp_name_snapshot: item.tcnp_name_snapshot ?? item.code_name_snapshot ?? '',
        note_text: item.note_text ?? '',
        sort_order: Number(item.sort_order ?? item.display_order ?? index + 1)
      })) : []
    };
  }

  ENR.api = {
    async login(username, password) {
      const data = await request('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
        skipAuthRedirect: true
      });
      return { ...data, session: normalizeSession(data) };
    },

    async getSession() {
      const data = await request('/auth/session', { skipAuthRedirect: true });
      return { ...data, session: data?.authenticated ? normalizeSession(data) : null };
    },

    async logout() {
      return request('/auth/logout', { method: 'POST', body: '{}' });
    },

    async getOrgUnits() {
      const data = await request('/org-units?ward_only=1');
      return (data?.units || []).map(normalizeWard);
    },

    async getPatients(query = '', ward = null) {
      const params = new URLSearchParams();
      if (query) params.set('q', query);
      if (ward?.id) params.set('org_unit_id', String(ward.id));
      if (ward?.code) params.set('unit_code', String(ward.code));
      params.set('limit', '100');
      const data = await request(`/patients?${params.toString()}`);
      let list = (data?.patients || []).map(normalizePatient);
      if (ward) {
        list = list.filter(patient => {
          if (ward.id && patient.orgUnitId) return Number(patient.orgUnitId) === Number(ward.id);
          if (ward.code && patient.wardCode) return String(patient.wardCode) === String(ward.code);
          return true;
        });
      }
      return list;
    },

    async getNursingPatientTypeSuggestion(encounterId, clinicalDatetime) {
      const params = new URLSearchParams();
      if (clinicalDatetime) params.set('clinical_datetime', clinicalDatetime);
      const data = await request(`/patients/${encodeURIComponent(encounterId)}/nursing-patient-type/suggestion?${params.toString()}`);
      return data?.suggestion || null;
    },

    async getTemplates(query = '') {
      const data = await request(`/nursing-templates?q=${encodeURIComponent(query)}`);
      return (data?.templates || data?.items || []).map(normalizeTemplate);
    },

    async getTemplate(code) {
      const data = await request(`/nursing-templates/by-code/${encodeURIComponent(code)}`);
      return normalizeTemplate(data?.template || data);
    },

    async searchTCNP(query, sectionCode) {
      const data = await request(
        `/tcnp/search?q=${encodeURIComponent(query)}&section_code=${encodeURIComponent(sectionCode)}&limit=${encodeURIComponent(config.TCNP_SEARCH_LIMIT || 80)}`
      );
      return (data?.items || []).map(normalizeTcnp);
    },

    async getNursingProblemSummary(encounterId) {
      const data = await request(`/patients/${encodeURIComponent(encounterId)}/nursing-problem-summary`);
      return data;
    },

    async getNursingNotes(encounterId) {
      const data = await request(`/patients/${encodeURIComponent(encounterId)}/nursing-notes`);
      return (data?.notes || []).map(normalizeNote);
    },

    async getNursingNote(noteId) {
      const data = await request(`/nursing-notes/${encodeURIComponent(noteId)}`);
      return normalizeNote(data?.note || data);
    },

    async createNursingNote(encounterId, payload) {
      return request(`/patients/${encodeURIComponent(encounterId)}/nursing-problems/compose`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    },

    async updateNursingNote(noteId, payload) {
      const data = await request(`/v3/nursing-notes/${encodeURIComponent(noteId)}`, {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });
      return normalizeNote(data?.note || data);
    },

    async cancelNursingNote(noteId, reason) {
      return request(`/nursing-notes/${encodeURIComponent(noteId)}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason, cancel_reason: reason })
      });
    },

    async signNursingNote(noteId) {
      return request(`/nursing-notes/${encodeURIComponent(noteId)}/sign`, {
        method: 'POST',
        body: '{}'
      });
    },

    async getAmendments(noteId) {
      const data = await request(`/nursing-notes/${encodeURIComponent(noteId)}/amendments`);
      return Array.isArray(data?.amendments) ? data.amendments : [];
    },

    async addAmendment(noteId, amendmentType, amendmentText, reason = null) {
      return request(`/nursing-notes/${encodeURIComponent(noteId)}/amendments`, {
        method: 'POST',
        body: JSON.stringify({
          amendment_type: String(amendmentType || '').toUpperCase(),
          amendment_text: amendmentText,
          reason
        })
      });
    },


    // CP6.3 — SIGNED Note Addendum / Amendment lifecycle
    async getSignedNoteAmendmentHistory(noteId) {
      return request(`/nursing-notes/${encodeURIComponent(noteId)}/amendment-actions`);
    },

    // CP6.5 — Audit-ready SIGNED Nursing Record Packet from PostgreSQL
    async getNursingRecordPacket(encounterId) {
      return request(`/encounters/${encodeURIComponent(encounterId)}/nursing-record-packet`);
    },

    // CP6.4 — Read-only bulk post-sign history for Signed PDF / Print
    async getEncounterSignedNoteAmendmentHistory(encounterId) {
      return request(`/encounters/${encodeURIComponent(encounterId)}/nursing-note-amendment-history`);
    },

    async addSignedNoteAmendment(noteId, amendmentType, amendmentText, reason = null) {
      return request(`/nursing-notes/${encodeURIComponent(noteId)}/amendment-actions`, {
        method: 'POST',
        body: JSON.stringify({
          amendment_type: String(amendmentType || '').toUpperCase(),
          amendment_text: amendmentText,
          reason
        })
      });
    },

    async cancelSignedNoteAmendment(noteId, amendmentId, reason) {
      return request(`/nursing-notes/${encodeURIComponent(noteId)}/amendment-actions/${encodeURIComponent(amendmentId)}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason, cancel_reason: reason })
      });
    },

    // Admin Template Builder
    async adminListTemplates(query = '') {
      const data = await request(`/admin/templates?q=${encodeURIComponent(query)}`);
      return (data?.templates || []).map(normalizeTemplate);
    },

    async adminGetTemplate(id) {
      const data = await request(`/admin/templates/${encodeURIComponent(id)}`);
      return normalizeTemplate(data?.template || data);
    },

    // CP6.14-FULL-TEMPLATE-MANAGEMENT
    async adminCreateTemplateVersion(id) {
      const data = await request(`/admin/templates/${encodeURIComponent(id)}/new-version`, {
        method: 'POST',
        body: '{}'
      });
      return normalizeTemplate(data?.template || data);
    },

    async adminTemplateManagementPing() {
      return request('/admin/template-management/ping');
    },

    async adminSaveTemplate(template) {
      const normalized = normalizeTemplate(template);
      const payload = {
        ...normalized,
        template_code: normalized.code,
        template_name: normalized.name_th,
        version_no: normalized.version,
        parent_template_id: normalized.parent_template_id,
        items: normalized.items.map(item => ({
          ...item,
          default_text: item.note_template
        }))
      };

      const data = normalized.id
        ? await request(`/admin/templates/${encodeURIComponent(normalized.id)}`, {
            method: 'PATCH',
            body: JSON.stringify(payload)
          })
        : await request('/admin/templates', {
            method: 'POST',
            body: JSON.stringify(payload)
          });

      return normalizeTemplate(data?.template || data);
    }
  };

  ENR.api._normalizeSession = normalizeSession;
  ENR.api._normalizePatient = normalizePatient;
  ENR.api._normalizeTemplate = normalizeTemplate;
  ENR.api._normalizeNote = normalizeNote;
})();
