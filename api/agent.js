export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const sbUrl = process.env.SUPABASE_URL;
  const sbKey = process.env.SUPABASE_KEY;
  const sbH = {
    'apikey': sbKey,
    'Authorization': `Bearer ${sbKey}`,
    'Content-Type': 'application/json',
  };

  try {
    // ── GET ───────────────────────────────────────────────────────────────────
    if (req.method === 'GET') {
      const { view, customer_email } = req.query || {};

      // GET ?view=telemetry  →  all live rig rows (or one customer's row)
      if (view === 'telemetry') {
        let url = `${sbUrl}/rest/v1/rig_telemetry?order=last_seen.desc`;
        if (customer_email) url += `&customer_email=eq.${encodeURIComponent(customer_email)}`;
        const r = await fetch(url, { headers: sbH });
        const data = await r.json().catch(() => []);
        return res.status(200).json({ rigs: Array.isArray(data) ? data : [] });
      }

      // GET ?view=laps&customer_email=X  →  lap history + personal bests
      if (view === 'laps') {
        if (!customer_email) return res.status(400).json({ error: 'customer_email required' });
        const r = await fetch(
          `${sbUrl}/rest/v1/lap_times?customer_email=eq.${encodeURIComponent(customer_email)}&order=recorded_at.desc&limit=100`,
          { headers: sbH }
        );
        const data = await r.json().catch(() => []);
        return res.status(200).json({ laps: Array.isArray(data) ? data : [] });
      }

      // GET (no view)  →  agent config (used by Python agent on startup)
      const r = await fetch(`${sbUrl}/rest/v1/agent_config?order=updated_at.desc&limit=1`, { headers: sbH });
      const data = await r.json().catch(() => []);
      const config = Array.isArray(data) && data.length > 0 ? data[0] : null;
      return res.status(200).json({ config });
    }

    // ── POST ──────────────────────────────────────────────────────────────────
    if (req.method === 'POST') {
      const body = req.body || {};
      const { type } = body;

      // POST {type:'config', ...}  →  save agent config / announcements
      if (type === 'config' || !type) {
        const payload = { ...body };
        delete payload.type;
        payload.updated_at = new Date().toISOString();
        const r = await fetch(`${sbUrl}/rest/v1/agent_config`, {
          method: 'POST',
          headers: { ...sbH, 'Prefer': 'return=representation' },
          body: JSON.stringify(payload),
        });
        const data = await r.json().catch(() => ({}));
        return res.status(201).json({ config: Array.isArray(data) ? data[0] : data });
      }

      // POST {type:'telemetry', customer_email, gpu_temp, ram_usage,
      //        fps, game_active, usb_devices, software_updates, usb_events, game_telemetry}
      if (type === 'telemetry') {
        const {
          customer_email, gpu_temp, ram_usage, fps,
          game_active, usb_devices, software_updates, usb_events, game_telemetry,
        } = body;
        if (!customer_email) return res.status(400).json({ error: 'customer_email required' });

        // Upsert telemetry: DELETE existing row then INSERT fresh one
        await fetch(
          `${sbUrl}/rest/v1/rig_telemetry?customer_email=eq.${encodeURIComponent(customer_email)}`,
          { method: 'DELETE', headers: sbH }
        );
        const telRow = {
          customer_email,
          gpu_temp: gpu_temp ?? null,
          ram_usage: ram_usage ?? null,
          fps: fps ?? null,
          game_active: game_active ?? null,
          usb_devices: usb_devices ? JSON.stringify(usb_devices) : null,
          software_updates: software_updates ? JSON.stringify(software_updates) : null,
          game_telemetry: game_telemetry ? JSON.stringify(game_telemetry) : null,
          last_seen: new Date().toISOString(),
        };
        const tr = await fetch(`${sbUrl}/rest/v1/rig_telemetry`, {
          method: 'POST',
          headers: { ...sbH, 'Prefer': 'return=representation' },
          body: JSON.stringify(telRow),
        });
        const telData = await tr.json().catch(() => ({}));

        // Insert USB events if any
        if (Array.isArray(usb_events) && usb_events.length > 0) {
          const evRows = usb_events.map(ev => ({
            customer_email,
            event_type: ev.event_type || 'dropout',
            device_name: ev.device_name || null,
            device_id: ev.device_id || null,
            occurred_at: ev.occurred_at || new Date().toISOString(),
          }));
          await fetch(`${sbUrl}/rest/v1/usb_events`, {
            method: 'POST',
            headers: sbH,
            body: JSON.stringify(evRows),
          });
        }

        return res.status(201).json({ ok: true, rig: Array.isArray(telData) ? telData[0] : telData });
      }

      // POST {type:'laps', customer_email, game, track, car, lap_time_ms,
      //        lap_time_formatted, session_type, fuel_level, tire_wear}
      if (type === 'laps') {
        const {
          customer_email, game, track, car,
          lap_time_ms, lap_time_formatted, session_type, fuel_level, tire_wear,
        } = body;
        if (!customer_email || !lap_time_ms) {
          return res.status(400).json({ error: 'customer_email and lap_time_ms required' });
        }

        // Check existing personal best for this customer+track+car combo
        let is_personal_best = false;
        const pbUrl = `${sbUrl}/rest/v1/lap_times?customer_email=eq.${encodeURIComponent(customer_email)}&is_personal_best=eq.true&order=lap_time_ms.asc`;
        const pbFilters = [];
        if (track) pbFilters.push(`track=eq.${encodeURIComponent(track)}`);
        if (car)   pbFilters.push(`car=eq.${encodeURIComponent(car)}`);
        if (game)  pbFilters.push(`game=eq.${encodeURIComponent(game)}`);
        const pbQuery = pbFilters.length
          ? `${sbUrl}/rest/v1/lap_times?customer_email=eq.${encodeURIComponent(customer_email)}&is_personal_best=eq.true&${pbFilters.join('&')}&order=lap_time_ms.asc`
          : pbUrl;

        const pbRes = await fetch(pbQuery, { headers: sbH });
        const pbData = await pbRes.json().catch(() => []);
        const currentPB = Array.isArray(pbData) && pbData.length > 0 ? pbData[0] : null;

        if (!currentPB || lap_time_ms < currentPB.lap_time_ms) {
          is_personal_best = true;
          // Demote any existing PBs for this combo
          if (currentPB) {
            const demoteFilters = pbFilters.length
              ? `customer_email=eq.${encodeURIComponent(customer_email)}&is_personal_best=eq.true&${pbFilters.join('&')}`
              : `customer_email=eq.${encodeURIComponent(customer_email)}&is_personal_best=eq.true`;
            await fetch(`${sbUrl}/rest/v1/lap_times?${demoteFilters}`, {
              method: 'PATCH',
              headers: { ...sbH, 'Prefer': 'return=minimal' },
              body: JSON.stringify({ is_personal_best: false }),
            });
          }
        }

        const lapRow = {
          customer_email,
          game: game || null,
          track: track || null,
          car: car || null,
          lap_time_ms: parseInt(lap_time_ms, 10),
          lap_time_formatted: lap_time_formatted || null,
          session_type: session_type || null,
          fuel_level: fuel_level ?? null,
          tire_wear: tire_wear ?? null,
          is_personal_best,
          recorded_at: new Date().toISOString(),
        };

        const lr = await fetch(`${sbUrl}/rest/v1/lap_times`, {
          method: 'POST',
          headers: { ...sbH, 'Prefer': 'return=representation' },
          body: JSON.stringify(lapRow),
        });
        const lapData = await lr.json().catch(() => ({}));
        return res.status(201).json({
          ok: true,
          lap: Array.isArray(lapData) ? lapData[0] : lapData,
          is_personal_best,
        });
      }

      return res.status(400).json({ error: 'Unknown type. Use config, telemetry, or laps.' });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('Agent API error:', error);
    return res.status(500).json({ error: 'Failed to process request', message: error.message });
  }
}
