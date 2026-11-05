/* 친구에게 도전장 보내기 — 닉네임 입력 → 내 기록(재료·조각 두께)을 담은 링크 → 공유 시트(터치 기기) / 클립보드 복사(그 외). 게임 판정·점수에는 관여하지 않는다.
 * 공개 주소(C.SHARE.URL)가 없고 http(s) 로 열린 것도 아니면(예: file://) 임의 주소를 쓰지 않고 버튼을 비활성화한 채 안내만 한다. 취소는 조용히 복귀. */
(function () {
  'use strict';
  var SL = window.SL = window.SL || {};
  var SH = SL.C.SHARE;
  var ui = null, toastTimer = null, provider = null;

  function toast(msg) {
    if (!ui || !ui.toast) return;
    ui.toast.textContent = msg; ui.toast.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { ui.toast.hidden = true; }, 2200);
  }
  function isTouch() { try { return window.matchMedia('(pointer: coarse)').matches; } catch (e) { return false; } }

  // 닉네임 입력(도전장에 적힌다) — 마지막으로 쓴 닉네임을 기억한다
  function askNickname() {
    return new Promise(function (resolve) {
      var modal = document.getElementById('modal'), input = document.getElementById('modal-input'), okB = document.getElementById('modal-ok'), noB = document.getElementById('modal-cancel');
      var last = ''; try { last = localStorage.getItem('cut_nick') || ''; } catch (e) { /* 무시 */ }
      modal.classList.remove('hidden'); input.value = last;
      setTimeout(function () { try { input.focus(); input.select(); } catch (e) { /* 무시 */ } }, 50);
      function done(v) { modal.classList.add('hidden'); okB.removeEventListener('click', ok); noB.removeEventListener('click', cancel); input.removeEventListener('keydown', key); resolve(v); }
      function ok() { var v = (input.value || '').trim() || '친구'; try { localStorage.setItem('cut_nick', v); } catch (e) { /* 무시 */ } done(v); }
      function cancel() { done(null); }
      function key(e) { if (e.key === 'Enter') ok(); if (e.key === 'Escape') cancel(); e.stopPropagation(); }
      okB.addEventListener('click', ok); noB.addEventListener('click', cancel); input.addEventListener('keydown', key);
    });
  }

  function shareText(score) { return SH.TEXT.replace('{ing}', provider().name).replace('{score}', String(score)); }

  // 반환: Promise<'shared' | 'copied' | 'cancelled' | 'disabled' | 'failed'>
  function challenge() {
    var rec = provider && provider();
    if (!rec || !rec.th) return Promise.resolve('disabled');
    return askNickname().then(function (nick) {
      if (nick == null) return 'cancelled';
      var url = SL.battle.buildUrl(SL.battle.makeToken({ nickname: nick, ing: rec.ing, th: rec.th }));
      var text = shareText(rec.score), data = { title: SH.TITLE, text: text, url: url };
      function copy() {
        var p = (navigator.clipboard && navigator.clipboard.writeText) ? navigator.clipboard.writeText(SH.TITLE + '\n' + text + '\n' + url) : Promise.reject(new Error('no clipboard'));
        return p.then(function () { toast(SH.COPIED); return 'copied'; }, function () { try { window.prompt('도전장 링크를 복사하세요', url); } catch (x) { /* 무시 */ } toast('복사하지 못했어요'); return 'failed'; });
      }
      if (isTouch() && navigator.share) {
        return navigator.share(data).then(function () { return 'shared'; }, function (e) { if (e && e.name === 'AbortError') return 'cancelled'; return copy(); });
      }
      return copy();
    });
  }

  // 항상 켜 둔다. 파일(file://)로 열었을 때만 "이 PC에서만 열리는 링크"라고 안내한다(공개 주소가 설정되면 사라짐)
  function refresh() {
    if (!ui) return;
    var local = SL.battle.isLocal();
    ui.challenge.disabled = false;
    ui.note.hidden = true;                           // 상시 표시하지 않는다 — 도전장 버튼을 눌렀을 때만(아래 click)
    ui.note.textContent = local ? '지금은 파일로 열려 있어, 만든 링크가 이 PC에서만 열려요' : '';
  }

  // els: { challenge, note, toast }, getRecord: () => { ing, name, th, score }
  function bind(els, getRecord) {
    ui = els; provider = getRecord;
    var busy = false;
    els.challenge.addEventListener('click', function () {
      if (busy) return; busy = true;
      if (SL.battle.isLocal()) els.note.hidden = false;   // file:// 에서만, 누른 뒤에 안내
      Promise.resolve().then(challenge).catch(function () { /* 토스트로 안내됨 */ }).then(function () { busy = false; });
    });
    refresh();
  }

  SL.share = { bind: bind, refresh: refresh, challenge: challenge, toast: toast, askNickname: askNickname };
})();
