import { restoreRun } from "./game.js";

export const SAVE_KEY = "abyssalArchive.save.v1";
export const SAVE_BACKUP_KEY = "abyssalArchive.save.backup.v1";

export function loadRunFromStorage(storage) {
  if (!canUseStorage(storage)) {
    return {
      run: null,
      notice: storageUnavailableNotice()
    };
  }

  const primary = loadRunSlot(storage, SAVE_KEY);
  const backup = loadRunSlot(storage, SAVE_BACKUP_KEY);

  if (primary.run && backup.run) {
    if (isNewerRun(backup.run, primary.run)) {
      mirrorPrimarySlot(storage, backup.run);
      return {
        run: backup.run,
        notice: {
          tone: "warning",
          recovered: true,
          title: "최근 자동 저장 백업으로 복구됨",
          detail: "주 저장보다 백업이 더 최신이라 마지막으로 기록된 지점에서 이어하기를 준비했습니다."
        }
      };
    }
    return { run: primary.run, notice: null };
  }

  if (primary.run) return { run: primary.run, notice: null };

  if (backup.run) {
    mirrorPrimarySlot(storage, backup.run);
    return {
      run: backup.run,
      notice: {
        tone: "warning",
        recovered: true,
        title: "자동 저장 백업으로 복구됨",
        detail: "주 저장 슬롯이 손상되어 마지막 정상 백업에서 이어하기를 준비했습니다."
      }
    };
  }

  if (primary.exists || backup.exists) {
    return {
      run: null,
      notice: {
        tone: "danger",
        recovered: false,
        title: "저장 데이터를 읽을 수 없음",
        detail: "브라우저 저장 슬롯이 손상되었습니다. 새 런을 시작하거나 손상 저장을 삭제하세요."
      }
    };
  }

  return { run: null, notice: null };
}

export function saveRunToStorage(storage, run) {
  if (!canUseStorage(storage)) {
    return {
      ok: false,
      notice: storageUnavailableNotice()
    };
  }

  try {
    const payload = JSON.stringify(run);
    writeStorage(storage, SAVE_BACKUP_KEY, payload);
    writeStorage(storage, SAVE_KEY, payload);
    return { ok: true, notice: null };
  } catch {
    return {
      ok: false,
      notice: {
        tone: "danger",
        recovered: false,
        title: "자동 저장 실패",
        detail: "브라우저 저장소에 현재 런을 기록하지 못했습니다. 저장 공간과 브라우저 설정을 확인하세요."
      }
    };
  }
}

export function deleteSavedRun(storage) {
  if (!canUseStorage(storage)) return;
  removeStorage(storage, SAVE_KEY);
  removeStorage(storage, SAVE_BACKUP_KEY);
}

export function loadRunSlot(storage, key) {
  const raw = readStorage(storage, key);
  if (!raw) return { exists: false, run: null };
  try {
    const run = restoreRun(JSON.parse(raw));
    return { exists: true, run };
  } catch {
    return { exists: true, run: null };
  }
}

function readStorage(storage, key) {
  try {
    return storage?.getItem?.(key) ?? null;
  } catch {
    return null;
  }
}

function writeStorage(storage, key, value) {
  storage?.setItem?.(key, value);
}

function canUseStorage(storage) {
  return Boolean(storage && typeof storage.getItem === "function" && typeof storage.setItem === "function" && typeof storage.removeItem === "function");
}

function storageUnavailableNotice() {
  return {
    tone: "danger",
    recovered: false,
    title: "브라우저 저장소를 사용할 수 없음",
    detail: "자동 저장과 이어하기가 꺼진 상태입니다. 브라우저 저장 권한을 허용한 뒤 새로고침하세요."
  };
}

function mirrorPrimarySlot(storage, run) {
  try {
    writeStorage(storage, SAVE_KEY, JSON.stringify(run));
  } catch {
    // Loading must still succeed even when the browser refuses a repair write.
  }
}

function isNewerRun(candidate, current) {
  return (Number(candidate?.updatedAt) || 0) > (Number(current?.updatedAt) || 0);
}

function removeStorage(storage, key) {
  try {
    storage?.removeItem?.(key);
  } catch {
    // Deleting a damaged browser slot is best-effort; the UI still returns to a safe state.
  }
}
