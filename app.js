
"use strict";

/* Zakerty - Local-first family memory research prototype */

const STORAGE_KEY = "zakerty_people_v1";
const SESSIONS_KEY = "zakerty_sessions_v1";
const STORIES_KEY = "zakerty_stories_v1";
const VOICE_SETTING_KEY = "zakerty_auto_voice_v1";
const ACCESSIBILITY_KEY = "zakerty_accessibility_v1";
const DB_NAME = "ZakertyPhotos";
const DB_VERSION = 3;
const PHOTO_STORE = "photos";
const AUDIO_STORE = "audio";
const STORY_AUDIO_STORE = "story-audio";
const MAX_AUDIO_SIZE = 12 * 1024 * 1024;
const MAX_RECORDING_MS = 30_000;
const REMINDER_API = "/api";

const $ = (selector) => document.querySelector(selector);

const state = {
  people: readStorage(STORAGE_KEY, []),
  sessions: readStorage(SESSIONS_KEY, []),
  stories: readStorage(STORIES_KEY, []),
  currentGame: null,
  game: null,
  memoryJourney: null,
  editingPersonId: null,
  autoReadQuestions: readStorage(VOICE_SETTING_KEY, false) === true,
  pendingPersonAudio: null,
  removePersonAudio: false,
  mediaRecorder: null,
  recordingStream: null,
  recordingChunks: [],
  recordingTimeout: null,
  pendingStoryAudio: null,
  storyRecorder: null,
  storyRecordingStream: null,
  storyRecordingChunks: [],
  storyRecordingTimeout: null
};

function readStorage(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function difficultyName(difficulty) {
  return ({
    easy: "سهل",
    normal: "متوسط",
    hard: "تحدي"
  })[difficulty] || "غير محدد";
}

function savePeople() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.people));
}

function saveSessions() {
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(state.sessions));
}

function saveStories() {
  localStorage.setItem(STORIES_KEY, JSON.stringify(state.stories));
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character]);
}

/* IndexedDB photo storage */

function openPhotoDB() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("المتصفح لا يدعم تخزين الصور محليًا."));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PHOTO_STORE)) {
        db.createObjectStore(PHOTO_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(AUDIO_STORE)) {
        db.createObjectStore(AUDIO_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORY_AUDIO_STORE)) {
        db.createObjectStore(STORY_AUDIO_STORE, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function savePhoto(id, blob) {
  const db = await openPhotoDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(PHOTO_STORE, "readwrite");
    transaction.objectStore(PHOTO_STORE).put({ id, blob });

    transaction.oncomplete = () => {
      db.close();
      resolve();
    };

    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

async function getPhoto(id) {
  const db = await openPhotoDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(PHOTO_STORE, "readonly");
    const request = transaction.objectStore(PHOTO_STORE).get(id);

    request.onsuccess = () => {
      db.close();
      resolve(request.result?.blob || null);
    };

    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}

async function saveAudio(id, blob) {
  const db = await openPhotoDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(AUDIO_STORE, "readwrite");
    transaction.objectStore(AUDIO_STORE).put({ id, blob });
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

async function getAudio(id) {
  const db = await openPhotoDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(AUDIO_STORE, "readonly");
    const request = transaction.objectStore(AUDIO_STORE).get(id);
    request.onsuccess = () => {
      db.close();
      resolve(request.result?.blob || null);
    };
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}

async function deleteAudio(id) {
  const db = await openPhotoDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(AUDIO_STORE, "readwrite");
    transaction.objectStore(AUDIO_STORE).delete(id);
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

async function saveStoryAudio(id, blob) {
  const db = await openPhotoDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORY_AUDIO_STORE, "readwrite");
    transaction.objectStore(STORY_AUDIO_STORE).put({ id, blob });
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

async function getStoryAudio(id) {
  const db = await openPhotoDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORY_AUDIO_STORE, "readonly");
    const request = transaction.objectStore(STORY_AUDIO_STORE).get(id);
    request.onsuccess = () => {
      db.close();
      resolve(request.result?.blob || null);
    };
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}

async function deleteStoryAudio(id) {
  const db = await openPhotoDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORY_AUDIO_STORE, "readwrite");
    transaction.objectStore(STORY_AUDIO_STORE).delete(id);
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

async function deletePhoto(id) {
  try {
    const db = await openPhotoDB();

    await new Promise((resolve, reject) => {
      const transaction = db.transaction(PHOTO_STORE, "readwrite");
      transaction.objectStore(PHOTO_STORE).delete(id);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });

    db.close();
  } catch (error) {
    console.error("Photo deletion failed:", error);
  }
}

async function photoUrl(id) {
  const blob = await getPhoto(id);
  return blob ? URL.createObjectURL(blob) : "";
}

function revokeImageUrls(container = document) {
  container.querySelectorAll("[data-object-url]").forEach((element) => {
    if (element.dataset.objectUrl) {
      URL.revokeObjectURL(element.dataset.objectUrl);
    }
  });
}

/* Navigation */

async function showPage(pageId) {
  document.querySelectorAll(".page").forEach((page) => {
    page.classList.toggle("hidden", page.id !== pageId);
  });

  document.querySelectorAll("[data-go]").forEach((button) => {
    const active = button.dataset.go === pageId;
    button.classList.toggle("active", active);
    if (active) {
      button.setAttribute("aria-current", "page");
    } else {
      button.removeAttribute("aria-current");
    }
  });

  if (pageId === "family") renderFamily();
  if (pageId === "stories") await renderStories();
  if (pageId === "research") renderResearch();
}

document.querySelectorAll("[data-go]").forEach((button) => {
  button.addEventListener("click", () => showPage(button.dataset.go));
});

/* Family members */

const personDialog = $("#personDialog");
const personForm = $("#personForm");
const personImage = $("#personImage");
const personBirthday = $("#personBirthday");
const personAudio = $("#personAudio");
const audioStatus = $("#personAudioStatus");
const startAudioRecording = $("#startAudioRecording");
const stopAudioRecording = $("#stopAudioRecording");
const removePersonAudioButton = $("#removePersonAudio");
const canRecordAudio = Boolean(
  navigator.mediaDevices?.getUserMedia && window.MediaRecorder
);

if (!canRecordAudio) {
  startAudioRecording.disabled = true;
  audioStatus.textContent =
    "التسجيل بالميكروفون غير مدعوم هنا؛ اختاري ملفًا صوتيًا. التسجيل يحتاج متصفحًا حديثًا واتصالًا آمنًا.";
}

function resetPersonAudioForm() {
  state.pendingPersonAudio = null;
  state.removePersonAudio = false;
  personAudio.value = "";
  stopAudioRecording.disabled = true;
  startAudioRecording.disabled = !canRecordAudio;
  removePersonAudioButton.classList.add("hidden");
  audioStatus.textContent = canRecordAudio
    ? "اختاري ملفًا صوتيًا أو سجّلي مقطعًا قصيرًا (حتى 30 ثانية). التسجيل يُحفظ على هذا الجهاز فقط."
    : "التسجيل بالميكروفون غير مدعوم هنا؛ اختاري ملفًا صوتيًا. التسجيل يحتاج متصفحًا حديثًا واتصالًا آمنًا.";
}

function stopRecordingStream() {
  if (state.recordingTimeout) {
    clearTimeout(state.recordingTimeout);
    state.recordingTimeout = null;
  }
  if (state.mediaRecorder?.state === "recording") {
    state.mediaRecorder.stop();
  }
  state.recordingStream?.getTracks().forEach((track) => track.stop());
  state.recordingStream = null;
  state.mediaRecorder = null;
  stopAudioRecording.disabled = true;
  startAudioRecording.disabled = !canRecordAudio;
}

startAudioRecording.addEventListener("click", async () => {
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    audioStatus.textContent = "تسجيل الصوت غير مدعوم؛ اختاري ملفًا صوتيًا بدلًا منه.";
    return;
  }

  startAudioRecording.disabled = true;
  audioStatus.textContent = "اسمحي باستخدام الميكروفون لبدء التسجيل.";
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    state.recordingStream = stream;
    state.recordingChunks = [];

    const preferredType = "audio/webm;codecs=opus";
    const options = typeof MediaRecorder.isTypeSupported === "function" &&
      MediaRecorder.isTypeSupported(preferredType)
      ? { mimeType: preferredType }
      : undefined;
    const recorder = new MediaRecorder(stream, options);
    state.mediaRecorder = recorder;

    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size) state.recordingChunks.push(event.data);
    });
    recorder.addEventListener("stop", () => {
      if (state.recordingTimeout) {
        clearTimeout(state.recordingTimeout);
        state.recordingTimeout = null;
      }
      const recording = new Blob(state.recordingChunks, {
        type: recorder.mimeType || "audio/webm"
      });
      state.recordingChunks = [];

      if (recording.size > MAX_AUDIO_SIZE) {
        state.pendingPersonAudio = null;
        audioStatus.textContent = "التسجيل أكبر من 12 ميجابايت. سجّلي مقطعًا أقصر.";
      } else if (recording.size) {
        state.pendingPersonAudio = recording;
        state.removePersonAudio = false;
        audioStatus.textContent = "تم تجهيز التسجيل. احفظي بيانات الشخص لتخزينه.";
      } else {
        audioStatus.textContent = "التسجيل فارغ. حاولي تسجيله مرة أخرى.";
      }

      state.recordingStream?.getTracks().forEach((track) => track.stop());
      state.recordingStream = null;
      state.mediaRecorder = null;
      stopAudioRecording.disabled = true;
      startAudioRecording.disabled = false;
    });

    recorder.start();
    stopAudioRecording.disabled = false;
    audioStatus.textContent = "جاري التسجيل… الحد الأقصى 30 ثانية.";
    state.recordingTimeout = setTimeout(() => {
      if (recorder.state === "recording") recorder.stop();
    }, MAX_RECORDING_MS);
  } catch (error) {
    console.error("Could not start voice recording:", error);
    state.recordingStream?.getTracks().forEach((track) => track.stop());
    state.recordingStream = null;
    startAudioRecording.disabled = false;
    audioStatus.textContent =
      "تعذر الوصول للميكروفون. راجعي إذن المتصفح أو اختاري ملفًا صوتيًا.";
  }
});

stopAudioRecording.addEventListener("click", stopRecordingStream);
personDialog.addEventListener("close", stopRecordingStream);

personAudio.addEventListener("change", () => {
  const file = personAudio.files[0];
  if (!file) {
    state.pendingPersonAudio = null;
    const editingPerson = state.people.find(
      (person) => person.id === state.editingPersonId
    );
    audioStatus.textContent = editingPerson?.hasAudio && !state.removePersonAudio
      ? "يوجد تسجيل صوتي محفوظ."
      : canRecordAudio
        ? "اختاري ملفًا صوتيًا أو سجّلي مقطعًا قصيرًا (حتى 30 ثانية)."
        : "التسجيل بالميكروفون غير مدعوم هنا؛ اختاري ملفًا صوتيًا.";
    return;
  }
  state.pendingPersonAudio = file;
  state.removePersonAudio = false;
  audioStatus.textContent = `الصوت المختار: ${file.name}. احفظي بيانات الشخص لتخزينه.`;
});

removePersonAudioButton.addEventListener("click", () => {
  state.pendingPersonAudio = null;
  personAudio.value = "";
  state.removePersonAudio = true;
  audioStatus.textContent = "سيُحذف التسجيل الصوتي عند حفظ بيانات الشخص.";
});

$("#addPersonBtn")?.addEventListener("click", () => {
  state.editingPersonId = null;
  personForm.reset();
  resetPersonAudioForm();
  personImage.required = true;
  $("#personDialogTitle").textContent = "إضافة فرد من العيلة";
  personImage.nextElementSibling.textContent = "الصورة بتتحفظ محليًا على الجهاز.";
  personDialog.showModal();
});

$("#closePersonDialog")?.addEventListener("click", () => {
  personDialog.close();
});

$("#cancelPerson")?.addEventListener("click", () => {
  personDialog.close();
});

personForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const name = $("#personName").value.trim();
  const relation = $("#personRelation").value.trim();
  const ageValue = $("#personAge").value;
  const note = $("#personNote").value.trim();
  const favoriteFood = $("#personFavoriteFood").value.trim();
  const favoriteSong = $("#personFavoriteSong").value.trim();
  const importantPlace = $("#personImportantPlace").value.trim();
  const file = personImage.files[0];
  const audioBlob = state.pendingPersonAudio;
  const editingPerson = state.people.find(
    (person) => person.id === state.editingPersonId
  );

  if (!name || !relation || (!file && !editingPerson)) {
    alert("اكتبي الاسم ودرجة القرابة واختاري صورة للشخص.");
    return;
  }

  if (file && !file.type.startsWith("image/")) {
    alert("اختاري ملف صورة صالح.");
    return;
  }

  if (file && file.size > 12 * 1024 * 1024) {
    alert("الصورة كبيرة جدًا. اختاري صورة أقل من 12 ميجابايت.");
    return;
  }

  if (audioBlob && !audioBlob.type.startsWith("audio/")) {
    alert("اختاري ملفًا صوتيًا صالحًا.");
    return;
  }

  if (audioBlob && audioBlob.size > MAX_AUDIO_SIZE) {
    alert("ملف الصوت كبير جدًا. اختاري ملفًا أقل من 12 ميجابايت.");
    return;
  }

  const id = editingPerson?.id || makeId();
  let previousPhoto = null;
  let previousAudio = null;
  let photoChanged = false;
  let audioChanged = false;

  try {
    if (file) {
      if (editingPerson) previousPhoto = await getPhoto(id);
      await savePhoto(id, file);
      photoChanged = true;
    }
    if (editingPerson && (audioBlob || state.removePersonAudio)) {
      previousAudio = await getAudio(id);
    }
    if (audioBlob) {
      await saveAudio(id, audioBlob);
      audioChanged = true;
    } else if (state.removePersonAudio) {
      await deleteAudio(id);
      audioChanged = true;
    }

    const updatedPerson = {
      id,
      name,
      relation,
      age: ageValue ? Number(ageValue) : null,
      note,
      favoriteFood,
      favoriteSong,
      importantPlace,
      birthday: personBirthday.value,
      hasAudio: audioBlob
        ? true
        : Boolean(editingPerson?.hasAudio && !state.removePersonAudio),
      createdAt: new Date().toISOString()
    };

    if (editingPerson) {
      updatedPerson.createdAt = editingPerson.createdAt;
      state.people = state.people.map((person) =>
        person.id === id ? updatedPerson : person
      );
    } else {
      state.people.push(updatedPerson);
    }

    try {
      savePeople();
    } catch (error) {
      if (editingPerson) {
        state.people = state.people.map((person) =>
          person.id === id ? editingPerson : person
        );
      } else {
        state.people = state.people.filter((person) => person.id !== id);
      }
      throw error;
    }

    personDialog.close();
    personForm.reset();
    resetPersonAudioForm();
    personImage.required = true;
    state.editingPersonId = null;
    await renderFamily();
    updateHome();
  } catch (error) {
    try {
      if (photoChanged) {
        if (editingPerson && previousPhoto) await savePhoto(id, previousPhoto);
        else await deletePhoto(id);
      }
      if (audioChanged) {
        if (previousAudio) await saveAudio(id, previousAudio);
        else await deleteAudio(id);
      }
    } catch (rollbackError) {
      console.error("Could not roll back person media after save failure:", rollbackError);
    }
    console.error(error);
    alert("محصلش حفظ للبيانات. اتأكدي من مساحة التخزين وحاولي تاني.");
  }
});

function openPersonEditor(id) {
  const person = state.people.find((item) => item.id === id);
  if (!person) return;

  state.editingPersonId = id;
  resetPersonAudioForm();
  $("#personDialogTitle").textContent = "تعديل بيانات فرد من العيلة";
  $("#personName").value = person.name;
  $("#personRelation").value = person.relation;
  $("#personAge").value = Number.isFinite(person.age) ? person.age : "";
  $("#personNote").value = person.note || "";
  $("#personFavoriteFood").value = person.favoriteFood || "";
  $("#personFavoriteSong").value = person.favoriteSong || "";
  $("#personImportantPlace").value = person.importantPlace || "";
  personBirthday.value = person.birthday
    ? birthdayInputValue(person.birthday)
    : "";
  personImage.value = "";
  personImage.required = false;
  personImage.nextElementSibling.textContent =
    "اختياري: اختار صورة جديدة لاستبدال الصورة الحالية.";
  if (person.hasAudio) {
    removePersonAudioButton.classList.remove("hidden");
    audioStatus.textContent = "يوجد تسجيل صوتي محفوظ. اختاري ملفًا جديدًا لاستبداله أو احذفيه.";
  }
  personDialog.showModal();
}

async function renderFamily() {
  const list = $("#familyList");
  const empty = $("#familyEmpty");
  const noResults = $("#familyNoResults");

  if (!list || !empty) return;

  revokeImageUrls(list);
  list.replaceChildren();

  const query = ($("#familySearch")?.value || "").trim().toLocaleLowerCase("ar");
  const sortBy = $("#familySort")?.value || "name";
  const people = state.people.filter((person) => (
    `${person.name} ${person.relation} ${person.favoriteFood || ""} ` +
    `${person.favoriteSong || ""} ${person.importantPlace || ""}`
  ).toLocaleLowerCase("ar").includes(query));

  people.sort((first, second) => {
    if (sortBy === "age") {
      return (Number.isFinite(second.age) ? second.age : -1) -
        (Number.isFinite(first.age) ? first.age : -1);
    }
    if (sortBy === "birthday") {
      return birthdayDaysAway(first.birthday) - birthdayDaysAway(second.birthday);
    }
    return String(first[sortBy] || "").localeCompare(
      String(second[sortBy] || ""),
      "ar"
    );
  });

  empty.classList.toggle("hidden", state.people.length > 0 || query.length > 0);
  if (noResults) {
    noResults.classList.toggle("hidden", state.people.length === 0 || people.length > 0);
  }

  for (const person of people) {
    const card = document.createElement("article");
    card.className = "person-card";

    const img = document.createElement("img");
    img.alt = `صورة ${person.name}`;
    img.loading = "lazy";

    try {
      const url = await photoUrl(person.id);
      if (url) {
        img.src = url;
        img.dataset.objectUrl = url;
      } else {
        img.alt = "الصورة غير متاحة؛ يمكنك تعديل بيانات الشخص أو صورته";
      }
    } catch {
      img.alt = "تعذر تحميل الصورة";
    }

    const title = document.createElement("h3");
    title.textContent = person.name;

    const relation = document.createElement("p");
    relation.textContent = person.relation;

    const note = document.createElement("p");
    note.textContent = person.note || "لا توجد حكاية مضافة بعد.";

    const interests = [
      person.favoriteFood && `الأكلة المفضلة: ${person.favoriteFood}`,
      person.favoriteSong && `الأغنية المفضلة: ${person.favoriteSong}`,
      person.importantPlace && `مكان مميز: ${person.importantPlace}`
    ].filter(Boolean);
    const interestsText = document.createElement("p");
    interestsText.className = "story-meta";
    interestsText.textContent = interests.join(" · ");

    let audioPlayer = null;
    if (person.hasAudio) {
      try {
        const recording = await getAudio(person.id);
        if (recording) {
          audioPlayer = document.createElement("audio");
          audioPlayer.controls = true;
          audioPlayer.preload = "none";
          audioPlayer.setAttribute("aria-label", `تسجيل صوت ${person.name}`);
          const url = URL.createObjectURL(recording);
          audioPlayer.src = url;
          audioPlayer.dataset.objectUrl = url;
        }
      } catch (error) {
        console.error(`Could not load voice recording for ${person.name}:`, error);
      }
    }

    const actions = document.createElement("div");
    actions.className = "actions";

    const details = document.createElement("p");
    const metadata = [];
    if (Number.isFinite(person.age)) metadata.push(`العمر: ${person.age}`);
    if (person.birthday) metadata.push(`عيد الميلاد: ${formatBirthday(person.birthday)}`);
    details.textContent = metadata.join(" • ");

    const editButton = document.createElement("button");
    editButton.className = "secondary";
    editButton.textContent = "تعديل البيانات";
    editButton.addEventListener("click", () => openPersonEditor(person.id));
    const deleteButton = document.createElement("button");
    deleteButton.className = "danger";
    deleteButton.textContent = "حذف";
    deleteButton.addEventListener("click", () => removePerson(person.id));

    actions.append(editButton, deleteButton);
    card.append(img, title, relation, details, note);
    if (interests.length) card.append(interestsText);
    if (audioPlayer) card.append(audioPlayer);
    card.append(actions);
    list.append(card);
  }
}

$("#familySearch")?.addEventListener("input", renderFamily);
$("#familySort")?.addEventListener("change", renderFamily);

async function removePerson(id) {
  const person = state.people.find((item) => item.id === id);
  if (!person) return;

  if (!confirm(`متأكدة إنك عايزة تحذفي ${person.name} وصورته وتسجيله الصوتي من التطبيق؟`)) {
    return;
  }

  state.people = state.people.filter((item) => item.id !== id);
  savePeople();
  await deletePhoto(id);
  await deleteAudio(id);
  await renderFamily();
  await renderStories();
  updateHome();
}

/* Family stories */

const storyForm = $("#storyForm");
const storyAudioInput = $("#storyAudio");
const storyAudioStatus = $("#storyAudioStatus");
const storyAudioSupported = Boolean(
  navigator.mediaDevices?.getUserMedia && window.MediaRecorder
);

function stopStoryRecording() {
  if (state.storyRecordingTimeout) {
    clearTimeout(state.storyRecordingTimeout);
    state.storyRecordingTimeout = null;
  }
  if (state.storyRecorder?.state === "recording") {
    state.storyRecorder.stop();
  }
  state.storyRecordingStream?.getTracks().forEach((track) => track.stop());
  state.storyRecordingStream = null;
  $("#stopStoryRecording").disabled = true;
  $("#startStoryRecording").disabled = !storyAudioSupported;
}

$("#startStoryRecording")?.addEventListener("click", async () => {
  if (!storyAudioSupported) {
    storyAudioStatus.textContent = "التسجيل غير مدعوم؛ اختاروا ملفًا صوتيًا بدلًا منه.";
    return;
  }

  $("#startStoryRecording").disabled = true;
  storyAudioStatus.textContent = "اسمحوا باستخدام الميكروفون لبدء التسجيل.";
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    state.storyRecordingStream = stream;
    state.storyRecordingChunks = [];
    const preferredType = "audio/webm;codecs=opus";
    const options = typeof MediaRecorder.isTypeSupported === "function" &&
      MediaRecorder.isTypeSupported(preferredType)
      ? { mimeType: preferredType }
      : undefined;
    const recorder = new MediaRecorder(stream, options);
    state.storyRecorder = recorder;
    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size) state.storyRecordingChunks.push(event.data);
    });
    recorder.addEventListener("stop", () => {
      if (state.storyRecordingTimeout) {
        clearTimeout(state.storyRecordingTimeout);
        state.storyRecordingTimeout = null;
      }
      const recording = new Blob(state.storyRecordingChunks, {
        type: recorder.mimeType || "audio/webm"
      });
      state.storyRecordingChunks = [];
      state.pendingStoryAudio = recording.size && recording.size <= MAX_AUDIO_SIZE
        ? recording
        : null;
      storyAudioStatus.textContent = !recording.size
        ? "التسجيل فارغ. حاولوا مرة أخرى."
        : recording.size > MAX_AUDIO_SIZE
          ? "التسجيل أكبر من 12 ميجابايت. سجّلوا مقطعًا أقصر."
          : "تم تجهيز التسجيل. احفظوا الحكاية لتخزينه.";
      state.storyRecordingStream?.getTracks().forEach((track) => track.stop());
      state.storyRecordingStream = null;
      state.storyRecorder = null;
      $("#stopStoryRecording").disabled = true;
      $("#startStoryRecording").disabled = false;
    });
    recorder.start();
    $("#stopStoryRecording").disabled = false;
    storyAudioStatus.textContent = "جاري تسجيل الحكاية… الحد الأقصى 30 ثانية.";
    state.storyRecordingTimeout = setTimeout(() => {
      if (recorder.state === "recording") recorder.stop();
    }, MAX_RECORDING_MS);
  } catch (error) {
    console.error("Could not start story recording:", error);
    state.storyRecordingStream?.getTracks().forEach((track) => track.stop());
    state.storyRecordingStream = null;
    $("#startStoryRecording").disabled = false;
    storyAudioStatus.textContent =
      "تعذر الوصول للميكروفون. راجعوا إذن المتصفح أو ارفعوا ملفًا صوتيًا.";
  }
});

$("#stopStoryRecording")?.addEventListener("click", stopStoryRecording);
storyAudioInput?.addEventListener("change", () => {
  const file = storyAudioInput.files[0];
  state.pendingStoryAudio = file || null;
  storyAudioStatus.textContent = file
    ? `التسجيل المختار: ${file.name}. احفظوا الحكاية لتخزينه.`
    : "ارفعوا ملفًا صوتيًا أو سجّلوا ذكرى قصيرة حتى 30 ثانية.";
});

storyForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.people.length) {
    alert("أضيفوا فردًا واحدًا على الأقل قبل ربط حكاية به.");
    showPage("family");
    return;
  }

  const audioFile = storyAudioInput.files[0];
  const audio = audioFile || state.pendingStoryAudio;
  if (audio && (!audio.type.startsWith("audio/") || audio.size > MAX_AUDIO_SIZE)) {
    alert("اختاروا ملفًا صوتيًا صالحًا لا يتجاوز 12 ميجابايت.");
    return;
  }

  const story = {
    id: makeId(),
    title: $("#storyTitle").value.trim(),
    personId: $("#storyPerson").value,
    date: $("#storyDate").value,
    text: $("#storyText").value.trim(),
    hasAudio: Boolean(audio),
    createdAt: new Date().toISOString()
  };
  if (!story.title || !story.text || !state.people.some((person) => person.id === story.personId)) {
    alert("اكتبوا عنوان الحكاية ونصها واختاروا فردًا من العيلة.");
    return;
  }

  try {
    if (audio) await saveStoryAudio(story.id, audio);
    state.stories.unshift(story);
    try {
      saveStories();
    } catch (error) {
      state.stories = state.stories.filter((item) => item.id !== story.id);
      if (audio) await deleteStoryAudio(story.id);
      throw error;
    }
    storyForm.reset();
    state.pendingStoryAudio = null;
    storyAudioStatus.textContent =
      "ارفعوا ملفًا صوتيًا أو سجّلوا ذكرى قصيرة حتى 30 ثانية. التسجيل محفوظ على هذا الجهاز.";
    await renderStories();
    updateHome();
  } catch (error) {
    console.error("Could not save family story:", error);
    alert("تعذر حفظ الحكاية. تأكدوا من مساحة التخزين وحاولوا مرة أخرى.");
  }
});

async function renderStories() {
  const timeline = $("#storyTimeline");
  const empty = $("#storiesEmpty");
  const select = $("#storyPerson");
  if (!timeline || !select) return;

  const selectedPerson = select.value;
  select.replaceChildren();
  state.people.forEach((person) => {
    const option = document.createElement("option");
    option.value = person.id;
    option.textContent = `${person.name} — ${person.relation}`;
    select.append(option);
  });
  if (state.people.some((person) => person.id === selectedPerson)) {
    select.value = selectedPerson;
  }
  select.disabled = !state.people.length;
  const submitButton = storyForm?.querySelector('[type="submit"]');
  if (submitButton) submitButton.disabled = !state.people.length;

  revokeImageUrls(timeline);
  timeline.replaceChildren();
  const stories = [...state.stories].sort((first, second) =>
    String(second.date || second.createdAt).localeCompare(
      String(first.date || first.createdAt)
    )
  );
  empty.classList.toggle("hidden", stories.length > 0);

  for (const story of stories) {
    const person = state.people.find((item) => item.id === story.personId);
    const card = document.createElement("article");
    card.className = "story-card";
    card.id = `story-${story.id}`;

    const title = document.createElement("h3");
    title.textContent = story.title;
    const metadata = document.createElement("p");
    metadata.className = "story-meta";
    const storyDate = story.date
      ? new Date(`${story.date}T12:00:00`).toLocaleDateString("ar-EG", {
          year: "numeric",
          month: "long",
          day: "numeric"
        })
      : new Date(story.createdAt).toLocaleDateString("ar-EG");
    metadata.textContent = `${person ? `${person.name} · ${person.relation}` : "فرد غير موجود في الألبوم"} · ${storyDate}`;
    const content = document.createElement("p");
    content.className = "story-content";
    content.textContent = story.text;
    card.append(title, metadata, content);

    if (person) {
      try {
        const url = await photoUrl(person.id);
        if (url) {
          const image = document.createElement("img");
          image.className = "story-photo";
          image.src = url;
          image.alt = `صورة ${person.name} المرتبطة بالحكاية`;
          image.loading = "lazy";
          image.dataset.objectUrl = url;
          card.insertBefore(image, content);
        }
      } catch (error) {
        console.error(`Could not load story photo for ${person.name}:`, error);
      }
    }

    if (story.hasAudio) {
      try {
        const recording = await getStoryAudio(story.id);
        if (recording) {
          const player = document.createElement("audio");
          player.controls = true;
          player.preload = "none";
          player.setAttribute("aria-label", `التسجيل الصوتي للحكاية: ${story.title}`);
          const url = URL.createObjectURL(recording);
          player.src = url;
          player.dataset.objectUrl = url;
          card.append(player);
        }
      } catch (error) {
        console.error(`Could not load story recording ${story.id}:`, error);
      }
    }

    const actions = document.createElement("div");
    actions.className = "actions";
    const readButton = document.createElement("button");
    readButton.type = "button";
    readButton.className = "secondary";
    readButton.textContent = "🔊 اقرأ الحكاية";
    readButton.addEventListener("click", () => {
      if (!speakArabic(`${story.title}. ${story.text}`)) {
        alert("تشغيل القراءة الصوتية غير مدعوم في هذا المتصفح.");
      }
    });
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "danger";
    deleteButton.textContent = "حذف الحكاية";
    deleteButton.addEventListener("click", async () => {
      if (!confirm(`هل تريدون حذف حكاية «${story.title}»؟`)) return;
      const previousStories = state.stories;
      state.stories = state.stories.filter((item) => item.id !== story.id);
      try {
        saveStories();
        if (story.hasAudio) await deleteStoryAudio(story.id);
        await renderStories();
        updateHome();
      } catch (error) {
        state.stories = previousStories;
        try {
          saveStories();
        } catch (rollbackError) {
          console.error("Could not restore story metadata after delete failure:", rollbackError);
        }
        console.error("Could not delete family story:", error);
        alert("تعذر حذف الحكاية من التخزين المحلي.");
      }
    });
    actions.append(readButton, deleteButton);
    card.append(actions);
    timeline.append(card);
  }
}

$("#weeklyChallengeButton")?.addEventListener("click", async () => {
  const story = getWeeklyStory();
  await showPage("stories");
  if (story) {
    document.getElementById(`story-${story.id}`)?.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });
  } else {
    $("#storyTitle")?.focus();
  }
});

function getWeeklyStory() {
  if (!state.stories.length) return null;
  const week = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000));
  return [...state.stories].sort((first, second) =>
    first.id.localeCompare(second.id)
  )[week % state.stories.length];
}

function renderWeeklyChallenge() {
  const prompt = $("#weeklyChallengeText");
  const button = $("#weeklyChallengeButton");
  if (!prompt || !button) return;
  const story = getWeeklyStory();
  prompt.textContent = story
    ? `لو الوقت مناسب، افتحوا «${story.title}» واستمتعوا بذكرى العيلة سوا.`
    : "أضيفوا حكاية عائلية، وارجعوا لها معًا وقت ما تحبوا.";
  button.textContent = story ? "افتحوا الذكرى" : "أضيفوا أول حكاية";
}

/* Home summary */

function birthdayDaysAway(birthday) {
  if (!birthday || !isValidBirthday(birthday)) return Infinity;

  const [, month, day] = birthdayParts(birthday);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let year = today.getFullYear(); ; year++) {
    const occurrence = new Date(year, month - 1, day);
    if (occurrence.getMonth() === month - 1) {
      occurrence.setHours(0, 0, 0, 0);
      if (occurrence >= today) {
        return Math.round((occurrence - today) / 86400000);
      }
    }
  }

  return Infinity;
}

function formatBirthday(birthday) {
  if (!isValidBirthday(birthday)) return "";
  const [, month, day] = birthdayParts(birthday);
  return new Date(2000, month - 1, day).toLocaleDateString("ar-EG", {
    day: "numeric",
    month: "long"
  });
}

function birthdayParts(birthday) {
  const parts = birthday.split("-").map(Number);
  return parts.length === 3 ? parts : [null, parts[0], parts[1]];
}

function birthdayInputValue(birthday) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(birthday)) return birthday;
  const [month, day] = birthday.split("-");
  return `${new Date().getFullYear()}-${month}-${day}`;
}

function isValidBirthday(birthday) {
  if (!birthday) return true;
  if (!/^(?:\d{2}-\d{2}|\d{4}-\d{2}-\d{2})$/.test(birthday)) return false;

  const parts = birthdayParts(birthday);
  if (parts.length !== 3) return false;
  const [year, month, day] = parts;

  if (!month || !day || month > 12 || day > 31) return false;
  if (year === null) {
    const date = new Date(2000, month - 1, day);
    return date.getMonth() === month - 1 && date.getDate() === day;
  }

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(birthday) ||
    year < 1 ||
    year > 9999
  ) {
    return false;
  }

  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(0, 0, 0, 0);
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
}

function renderUpcomingBirthdays() {
  const list = $("#upcomingBirthdays");
  if (!list) return;

  list.replaceChildren();
  const upcoming = state.people
    .filter((person) => Number.isFinite(birthdayDaysAway(person.birthday)))
    .sort((first, second) =>
      birthdayDaysAway(first.birthday) - birthdayDaysAway(second.birthday)
    )
    .slice(0, 5);

  if (!upcoming.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "أضفوا يوم وشهر الميلاد لشخص عشان يظهر هنا.";
    list.append(empty);
    return;
  }

  upcoming.forEach((person) => {
    const row = document.createElement("div");
    row.className = "upcoming-row";

    const name = document.createElement("strong");
    name.textContent = person.name;

    const date = document.createElement("span");
    const days = birthdayDaysAway(person.birthday);
    date.textContent = days === 0
      ? `النهارده · ${formatBirthday(person.birthday)}`
      : days === 1
        ? `بكرة · ${formatBirthday(person.birthday)}`
        : `بعد ${days} يوم · ${formatBirthday(person.birthday)}`;

    row.append(name, date);
    list.append(row);
  });
}

function updateHome() {
  const count = $("#familyCount");
  if (count) count.textContent = state.people.length;

  const sessionsCount = $("#homeSessionCount");
  if (sessionsCount) sessionsCount.textContent = state.sessions.length;
  renderUpcomingBirthdays();
  renderWeeklyChallenge();
}

/* Local Web Push reminders */

async function reminderApi(endpoint, options = {}) {
  const response = await fetch(`${REMINDER_API}${endpoint}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers
    }
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.error || "تعذر الاتصال بالخادم المحلي.");
  }
  return result;
}

function setReminderStatus(message, isError = false) {
  const status = $("#reminderStatus");
  if (!status) return;
  status.textContent = message;
  status.classList.toggle("error", isError);
}

function reminderDays() {
  return [...document.querySelectorAll(".reminder-day-list input:checked")]
    .map((input) => Number(input.value));
}

function applyReminderSettings(reminder) {
  $("#reminderEnabled").checked = reminder.enabled;
  $("#reminderTime").value = reminder.time;
  $("#reminderMessage").value = reminder.message;
  $("#reminderAdaptive").checked = reminder.adaptive;
  document.querySelectorAll(".reminder-day-list input").forEach((input) => {
    input.checked = reminder.days.includes(Number(input.value));
  });
}

async function requestReminderPermission() {
  if (!("Notification" in window)) {
    throw new Error("الإشعارات غير مدعومة في هذا المتصفح.");
  }
  if (Notification.permission === "denied") {
    throw new Error(
      "Edge حاظر إشعارات الموقع. افتحي edge://settings/content/notifications، " +
      "واحذفي 127.0.0.1 من قائمة الحظر، ثم أعيدي تحميل الموقع."
    );
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("لم يتم السماح بالإشعارات من المتصفح.");
  }
  setReminderStatus("تم السماح بالإشعارات على هذا الجهاز.");
}

function decodeVapidKey(value) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

async function registerReminderDevice() {
  if (location.protocol !== "http:" || location.hostname !== "127.0.0.1") {
    throw new Error("افتحي الموقع من http://127.0.0.1:3000 بعد تشغيل الخادم المحلي.");
  }
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    throw new Error("متصفحك لا يدعم إشعارات الويب.");
  }
  if (!("Notification" in window)) {
    throw new Error("الإشعارات غير مدعومة في هذا المتصفح.");
  }
  if (Notification.permission !== "granted") {
    await requestReminderPermission();
  }

  const registration = await navigator.serviceWorker.register("./sw.js");
  await navigator.serviceWorker.ready;
  const { vapidPublicKey } = await reminderApi("/config");
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: decodeVapidKey(vapidPublicKey)
    });
  }

  await reminderApi("/devices", {
    method: "POST",
    body: JSON.stringify({ subscription: subscription.toJSON() })
  });
  setReminderStatus("تم ربط هذا المتصفح بإشعارات ذاكرتي.");
}

async function saveReminderSettings() {
  const days = reminderDays();
  if ($("#reminderEnabled").checked && !days.length) {
    throw new Error("اختاري يومًا واحدًا على الأقل.");
  }

  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if ($("#reminderEnabled").checked && !subscription) {
    throw new Error("اسمحي بالإشعارات وارْبطي هذا الجهاز أولًا.");
  }
  if (subscription && $("#reminderEnabled").checked) {
    await reminderApi("/devices", {
      method: "POST",
      body: JSON.stringify({ subscription: subscription.toJSON() })
    });
  }

  await reminderApi("/reminders", {
    method: "PUT",
    body: JSON.stringify({
      enabled: $("#reminderEnabled").checked,
      time: $("#reminderTime").value,
      days: days.length ? days : [new Date().getDay()],
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      message: $("#reminderMessage").value,
      adaptive: $("#reminderAdaptive").checked
    })
  });

  setReminderStatus(
    $("#reminderEnabled").checked
      ? "تم حفظ الجدول. لازم يفضل الخادم المحلي شغال لإرسال التذكير."
      : "تم حفظ الإعدادات والتذكيرات متوقفة."
  );
}

async function sendTestReminder() {
  await reminderApi("/reminders/test", { method: "POST" });
  setReminderStatus("تم قبول الإشعار التجريبي للإرسال. راجعي إعدادات إشعارات المتصفح.");
}

async function stopReminders() {
  await reminderApi("/reminders/stop", { method: "POST" });
  $("#reminderEnabled").checked = false;
  setReminderStatus("تم إيقاف جدول التذكير.");
}

async function disconnectReminderDevice() {
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) {
    setReminderStatus("هذا الجهاز غير مربوط بالإشعارات.");
    return;
  }

  await reminderApi("/devices", {
    method: "DELETE",
    body: JSON.stringify({ endpoint: subscription.endpoint })
  });
  await subscription.unsubscribe();
  setReminderStatus("تم فصل هذا الجهاز عن الإشعارات.");
}

function bindReminderAction(buttonId, action) {
  $(`#${buttonId}`)?.addEventListener("click", async () => {
    try {
      await action();
    } catch (error) {
      console.error("Reminder action failed:", error);
      setReminderStatus(error.message, true);
    }
  });
}

bindReminderAction("reminderPermissionBtn", requestReminderPermission);
bindReminderAction("reminderSubscribeBtn", registerReminderDevice);
bindReminderAction("reminderSaveBtn", saveReminderSettings);
bindReminderAction("reminderTestBtn", sendTestReminder);
bindReminderAction("reminderStopBtn", stopReminders);
bindReminderAction("reminderUnsubscribeBtn", disconnectReminderDevice);

async function loadReminderSettings() {
  if (location.protocol === "file:") {
    setReminderStatus(
      "لتجربة التذكيرات، شغّلي الخادم المحلي وافتحي التطبيق من http://127.0.0.1:3000."
    );
    return;
  }

  try {
    const { reminder } = await reminderApi("/reminders");
    if (reminder) {
      applyReminderSettings(reminder);
      setReminderStatus(
        reminder.enabled
          ? "تم تحميل جدول التذكير المحفوظ."
          : "التذكيرات متوقفة حاليًا."
      );
    } else {
      setReminderStatus("اختاري الوقت والأيام ثم احفظي جدول التذكير.");
    }
  } catch (error) {
    setReminderStatus(
      "شغّلي الخادم المحلي أولًا: npm start، ثم افتحي http://127.0.0.1:3000.",
      true
    );
  }
}

/* Game utilities */

function shuffle(items) {
  const result = [...items];

  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}

function speakArabic(text) {
  if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
    return false;
  }

  try {
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "ar-EG";
    utterance.rate = 0.85;
    utterance.pitch = 1;

    window.speechSynthesis.speak(utterance);
    return true;
  } catch (error) {
    console.error("Arabic speech playback failed:", error);
    return false;
  }
}

function addQuestionAudio(panel, text) {
  const controls = document.createElement("div");
  controls.className = "audio-controls";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "secondary";
  button.textContent = "🔊 اسمع السؤال";
  button.addEventListener("click", () => {
    if (!speakArabic(text)) {
      alert("تشغيل الصوت غير مدعوم في هذا المتصفح.");
    }
  });
  controls.append(button);
  panel.append(controls);

  if (state.game?.autoReadQuestions) {
    speakArabic(text);
  }
}

function beginGame(gameType) {
  if (gameType === "memories") {
    startMemoryJourney();
    $("#gameArea")?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  if (state.people.length < 2) {
    alert("ضيفي صورتين على الأقل من أفراد العيلة الأول.");
    showPage("family");
    return;
  }

  const participantCode = ($("#participantCode")?.value || "").trim();

  if (!participantCode) {
    alert("اكتبي كودًا مستعارًا للمشارك في قسم البحث، من غير اسمه الحقيقي.");
    showPage("research");
    $("#participantCode")?.focus();
    return;
  }

  if (gameType === "clue" && !state.people.some((person) => personClue(person))) {
    alert("أضيفوا حكاية أو معلومة أو اهتمامًا مميزًا لشخص واحد على الأقل من قسم العيلة.");
    showPage("family");
    return;
  }

  if (gameType === "voice" && state.people.filter((person) => person.hasAudio).length < 2) {
    alert("ضيفي تسجيلين صوتيين على الأقل من قسم أفراد العيلة الأول.");
    showPage("family");
    return;
  }

  state.currentGame = gameType;
  state.game = {
    type: gameType,
    autoReadQuestions: state.autoReadQuestions,
    difficulty: $("#gameDifficulty")?.value || "normal",
    choiceCount: ({
      easy: 2,
      normal: 3,
      hard: 4
    })[$("#gameDifficulty")?.value] || 3,
    participantCode,
    startedAt: Date.now(),
    questionStartedAt: Date.now(),
    questions: [],
    index: 0,
    correct: 0,
    answered: 0,
    hints: 0,
    skipped: 0,
    responseTimes: [],
    orderAttempts: 0
  };

  $("#gameArea")?.classList.remove("hidden");

  if (gameType === "who") {
    startWhoGame();
  } else if (gameType === "clue") {
    startClueGame();
  } else if (gameType === "voice") {
    startVoiceGame();
  } else if (gameType === "order") {
    startOrderGame();
  }

  $("#gameArea")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

document.querySelectorAll("[data-game]").forEach((button) => {
  button.addEventListener("click", () => beginGame(button.dataset.game));
});

const autoReadInput = $("#autoReadQuestions");
const voiceSupport = $("#voiceSupport");
const speechAvailable =
  "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;

if (autoReadInput) {
  autoReadInput.checked = state.autoReadQuestions;
  autoReadInput.disabled = !speechAvailable;
  autoReadInput.addEventListener("change", () => {
    state.autoReadQuestions = autoReadInput.checked;
    try {
      localStorage.setItem(VOICE_SETTING_KEY, JSON.stringify(state.autoReadQuestions));
    } catch (error) {
      console.error("Could not save voice setting:", error);
      if (voiceSupport) {
        voiceSupport.textContent = "تعذر حفظ الاختيار، لكنه هيشتغل لحد ما تقفل الصفحة.";
      }
    }
  });
}

if (!speechAvailable && voiceSupport) {
  voiceSupport.textContent = "متصفحك لا يدعم القراءة الصوتية. جرّب متصفحًا أحدث.";
}

function gameShell(title, description = "") {
  const area = $("#gameArea");
  revokeImageUrls(area);
  area.replaceChildren();

  const panel = document.createElement("section");
  panel.className = "game-panel";

  const heading = document.createElement("h2");
  heading.textContent = title;

  panel.append(heading);

  if (description) {
    const paragraph = document.createElement("p");
    paragraph.textContent = description;
    panel.append(paragraph);
  }

  panel.dir = "rtl";
  area.append(panel);
  return panel;
}

function createFeedback(panel) {
  const feedback = document.createElement("p");
  feedback.className = "feedback";
  feedback.setAttribute("aria-live", "polite");
  panel.append(feedback);
  return feedback;
}

function addEndButton(panel) {
  const button = document.createElement("button");
  button.className = "secondary";
  button.textContent = "إنهاء الجلسة";
  button.addEventListener("click", () => finishGame(true));
  panel.append(button);
}

function recordAnswer(correct, responseTime) {
  const game = state.game;
  if (!game) return;

  game.answered += 1;
  if (correct) game.correct += 1;
  game.responseTimes.push(responseTime);
  game.questions.push({ correct, responseTime });
}

/* Game: مين بيتكلم؟ */

function startVoiceGame() {
  const game = state.game;
  game.queue = shuffle(state.people.filter((person) => person.hasAudio));
  game.index = 0;
  showVoiceQuestion();
}

async function showVoiceQuestion() {
  const game = state.game;
  if (!game) return;

  if (game.index >= game.queue.length) {
    finishGame(false);
    return;
  }

  const person = game.queue[game.index];
  const panel = gameShell(
    "مين بيتكلم؟",
    `اسمع التسجيل واختار الشخص المناسب. السؤال ${game.index + 1} من ${game.queue.length}.`
  );

  const recording = await getAudio(person.id);
  if (!recording) {
    console.error(`Voice recording is missing for ${person.name}.`);
    alert("التسجيل الصوتي غير متاح. راجعي بيانات أفراد العيلة.");
    finishGame(true);
    return;
  }

  const player = document.createElement("audio");
  player.controls = true;
  player.preload = "auto";
  player.setAttribute("aria-label", "تسجيل صوت الشخص المطلوب");
  const url = URL.createObjectURL(recording);
  player.src = url;
  player.dataset.objectUrl = url;
  panel.append(player);
  game.questionStartedAt = Date.now();

  const choices = shuffle([
    person,
    ...shuffle(game.queue.filter((item) => item.id !== person.id))
      .slice(0, Math.min(game.choiceCount - 1, game.queue.length - 1))
  ]);
  const options = document.createElement("div");
  options.className = "answer-options";
  const feedback = createFeedback(panel);

  choices.forEach((choice) => {
    const button = document.createElement("button");
    button.textContent = choice.name;
    button.addEventListener("click", () => {
      if (button.disabled) return;

      const correct = choice.id === person.id;
      recordAnswer(correct, Date.now() - game.questionStartedAt);
      options.querySelectorAll("button").forEach((option) => {
        option.disabled = true;
      });

      feedback.textContent = correct
        ? "عرفت الصوت! إجابة صحيحة ❤️"
        : `ولا يهمك، ده كان صوت ${person.name}.`;
      feedback.className = `feedback ${correct ? "good" : "bad"}`;

      const nextButton = document.createElement("button");
      nextButton.className = "primary";
      nextButton.textContent = "التسجيل التالي";
      nextButton.addEventListener("click", () => {
        game.index += 1;
        game.questionStartedAt = Date.now();
        showVoiceQuestion();
      });
      panel.append(nextButton);
    });
    options.append(button);
  });

  panel.append(options);

  const skipButton = document.createElement("button");
  skipButton.className = "secondary";
  skipButton.textContent = "تخطي التسجيل";
  skipButton.addEventListener("click", () => {
    game.skipped += 1;
    game.index += 1;
    game.questionStartedAt = Date.now();
    showVoiceQuestion();
  });
  panel.append(skipButton);
  addEndButton(panel);
}

/* Game 1: مين ده؟ */

async function startWhoGame() {
  const game = state.game;
  game.queue = shuffle(state.people);
  game.index = 0;
  await showWhoQuestion();
}

async function showWhoQuestion() {
  const game = state.game;
  if (!game) return;

  if (game.index >= game.queue.length) {
    finishGame(false);
    return;
  }

  const person = game.queue[game.index];
  const questionText =
    `مين ده؟ اختار الاسم المناسب للصورة. السؤال ${game.index + 1} من ${game.queue.length}.`;
  const panel = gameShell("مين ده؟", `السؤال ${game.index + 1} من ${game.queue.length}`);
  addQuestionAudio(panel, questionText);

  const img = document.createElement("img");
  img.className = "game-photo";
  img.alt = "صورة الشخص المطلوب التعرف عليه";

  try {
    const url = await photoUrl(person.id);
    if (url) {
      img.src = url;
      img.dataset.objectUrl = url;
    }
  } catch (error) {
    console.error(error);
  }

  panel.append(img);

  const options = document.createElement("div");
  options.className = "answer-options";

  const distractors = shuffle(state.people.filter((item) => item.id !== person.id))
    .slice(0, Math.min(game.choiceCount - 1, state.people.length - 1));

  const choices = shuffle([person, ...distractors]);
  const feedback = createFeedback(panel);

  choices.forEach((choice) => {
    const button = document.createElement("button");
    button.textContent = choice.name;

    button.addEventListener("click", () => {
      if (button.disabled) return;

      const elapsed = Date.now() - game.questionStartedAt;
      const correct = choice.id === person.id;

      options.querySelectorAll("button").forEach((item) => {
        item.disabled = true;
      });

      recordAnswer(correct, elapsed);
      feedback.textContent = correct
        ? "إجابة صحيحة، برافو! ❤️"
        : `ولا يهمك، الإجابة هي ${person.name}.`;
      feedback.className = `feedback ${correct ? "good" : "bad"}`;

      const nextButton = document.createElement("button");
      nextButton.className = "primary";
      nextButton.textContent = "السؤال التالي";
      nextButton.addEventListener("click", async () => {
        game.index += 1;
        game.questionStartedAt = Date.now();
        await showWhoQuestion();
      });

      panel.append(nextButton);
    });

    options.append(button);
  });

  panel.append(options);

  const hearButton = document.createElement("button");
  hearButton.className = "secondary";
  hearButton.textContent = "اسمع الاسم";
  hearButton.addEventListener("click", () => {
    game.hints += 1;
    if (!speakArabic(person.name)) {
      alert("تشغيل الصوت غير مدعوم في هذا المتصفح.");
    }
  });

  const skipButton = document.createElement("button");
  skipButton.className = "secondary";
  skipButton.textContent = "تخطي السؤال";
  skipButton.addEventListener("click", () => {
    game.skipped += 1;
    game.questionStartedAt = Date.now();
    game.index += 1;
    showWhoQuestion();
  });

  panel.append(hearButton, skipButton);
  addEndButton(panel);
}

/* Game 2: فاكر الحكاية؟ */

async function startClueGame() {
  const game = state.game;
  game.queue = shuffle(state.people.filter((person) => personClue(person)));
  game.index = 0;
  await showClueQuestion();
}

async function showClueQuestion() {
  const game = state.game;
  if (!game) return;

  if (game.index >= game.queue.length) {
    finishGame(false);
    return;
  }

  const person = game.queue[game.index];
  const clueText = personClue(person);
  const panel = gameShell(
    "فاكر الحكاية؟",
    "اقرأ المعلومة وحاول تعرف مين الشخص المقصود."
  );
  addQuestionAudio(
    panel,
    `فاكر الحكاية؟ اقرأ التلميح وحاول تعرف مين الشخص المقصود. ${clueText}`
  );

  const clue = document.createElement("blockquote");
  clue.textContent = clueText;
  panel.append(clue);

  const options = document.createElement("div");
  options.className = "answer-options";

  const others = shuffle(state.people.filter((item) => item.id !== person.id))
    .slice(0, Math.min(game.choiceCount - 1, state.people.length - 1));

  const choices = shuffle([person, ...others]);
  const feedback = createFeedback(panel);

  choices.forEach((choice) => {
    const button = document.createElement("button");
    button.textContent = choice.name;

    button.addEventListener("click", () => {
      if (button.disabled) return;

      const elapsed = Date.now() - game.questionStartedAt;
      const correct = choice.id === person.id;

      options.querySelectorAll("button").forEach((item) => {
        item.disabled = true;
      });

      recordAnswer(correct, elapsed);
      feedback.textContent = correct
        ? "صح! حلو إنك افتكرت الحكاية. ❤️"
        : `الإجابة الصحيحة هي ${person.name}.`;
      feedback.className = `feedback ${correct ? "good" : "bad"}`;

      const nextButton = document.createElement("button");
      nextButton.className = "primary";
      nextButton.textContent = "الحكاية التالية";
      nextButton.addEventListener("click", () => {
        game.index += 1;
        game.questionStartedAt = Date.now();
        showClueQuestion();
      });

      panel.append(nextButton);
    });

    options.append(button);
  });

  panel.append(options);

  const hintButton = document.createElement("button");
  hintButton.className = "secondary";
  hintButton.textContent = "تلميح: اسمع الاسم";
  hintButton.addEventListener("click", () => {
    game.hints += 1;
    if (!speakArabic(person.name)) {
      alert("تشغيل الصوت غير مدعوم في هذا المتصفح.");
    }
  });

  const skipButton = document.createElement("button");
  skipButton.className = "secondary";
  skipButton.textContent = "تخطي";
  skipButton.addEventListener("click", () => {
    game.skipped += 1;
    game.index += 1;
    game.questionStartedAt = Date.now();
    showClueQuestion();
  });

  panel.append(hintButton, skipButton);
  addEndButton(panel);
}

function personClue(person) {
  return [
    person.note,
    person.favoriteFood && `أكلته المفضلة ${person.favoriteFood}`,
    person.favoriteSong && `أغنيته المفضلة ${person.favoriteSong}`,
    person.importantPlace && `مكان مميز له ${person.importantPlace}`
  ].filter(Boolean).join(" · ");
}

/* Gentle, unscored reminiscence activity */

function startMemoryJourney() {
  const stories = state.stories
    .filter((story) => state.people.some((person) => person.id === story.personId))
    .sort((first, second) =>
      String(first.date || first.createdAt).localeCompare(
        String(second.date || second.createdAt)
      )
    );

  if (!stories.length) {
    alert("أضيفوا حكاية واحدة على الأقل من قسم «حكايات العيلة» لبدء جلسة الذكريات.");
    showPage("stories");
    return;
  }

  state.memoryJourney = { stories, index: 0 };
  state.game = null;
  state.currentGame = null;
  $("#gameArea")?.classList.remove("hidden");
  showMemoryMoment();
}

async function showMemoryMoment() {
  const journey = state.memoryJourney;
  if (!journey) return;

  if (journey.index >= journey.stories.length) {
    finishMemoryJourney();
    return;
  }

  const story = journey.stories[journey.index];
  const person = state.people.find((item) => item.id === story.personId);
  if (!person) {
    journey.index += 1;
    await showMemoryMoment();
    return;
  }

  const panel = gameShell(
    "جلسة ذكريات هادئة 🌿",
    "خدوا وقتكم. مفيش إجابة مطلوبة، وممكن تتفرجوا أو تسمعوا بس."
  );
  const image = document.createElement("img");
  image.className = "game-photo memory-photo";
  image.alt = `صورة ${person.name}`;
  try {
    const url = await photoUrl(person.id);
    if (url) {
      image.src = url;
      image.dataset.objectUrl = url;
      panel.append(image);
    }
  } catch (error) {
    console.error(`Could not load memory photo for ${person.name}:`, error);
  }

  const title = document.createElement("h3");
  title.textContent = story.title;
  const relation = document.createElement("p");
  relation.className = "memory-cue";
  relation.textContent = `دي ذكرى مرتبطة بـ ${person.name}، ${person.relation}.`;
  const invitation = document.createElement("p");
  invitation.className = "memory-invitation";
  invitation.textContent = "لو حابين، احكوا مع بعض عن الصورة أو الإحساس اللي بتفكّركم بيه.";
  panel.append(title, relation, invitation);

  const cues = [
    person.note && `معلومة عنه: ${person.note}`,
    person.favoriteFood && `كان بيحب ${person.favoriteFood}.`,
    person.favoriteSong && `أغنية بتحبوها له: ${person.favoriteSong}.`,
    person.importantPlace && `مكان مميز: ${person.importantPlace}.`
  ].filter(Boolean);
  const cue = document.createElement("p");
  cue.className = "memory-cue hidden";
  cue.setAttribute("aria-live", "polite");
  cue.textContent = cues[0] || "ممكن تكتفوا بمشاهدة الصورة معًا.";
  panel.append(cue);

  const storyText = document.createElement("p");
  storyText.className = "story-content hidden";
  storyText.textContent = story.text;
  panel.append(storyText);

  if (story.hasAudio) {
    try {
      const recording = await getStoryAudio(story.id);
      if (recording) {
        const player = document.createElement("audio");
        player.controls = true;
        player.preload = "none";
        player.setAttribute("aria-label", `تسجيل حكاية ${story.title}`);
        const url = URL.createObjectURL(recording);
        player.src = url;
        player.dataset.objectUrl = url;
        panel.append(player);
      }
    } catch (error) {
      console.error(`Could not load memory story audio ${story.id}:`, error);
    }
  }

  const actions = document.createElement("div");
  actions.className = "actions memory-actions";

  const cueButton = document.createElement("button");
  cueButton.className = "secondary";
  cueButton.textContent = "معلومة تساعد على التذكّر";
  cueButton.disabled = !cues.length;
  cueButton.addEventListener("click", () => {
    cue.classList.remove("hidden");
    cueButton.disabled = true;
  });

  const showStoryButton = document.createElement("button");
  showStoryButton.className = "secondary";
  showStoryButton.textContent = "اقرؤوا الحكاية معًا";
  showStoryButton.addEventListener("click", () => {
    storyText.classList.remove("hidden");
    if (!story.hasAudio) speakArabic(`${story.title}. ${story.text}`);
    showStoryButton.disabled = true;
  });

  const nextButton = document.createElement("button");
  nextButton.className = "primary";
  nextButton.textContent = journey.index === journey.stories.length - 1
    ? "إنهاء والعودة"
    : "الذكرى التالية";
  nextButton.addEventListener("click", () => {
    journey.index += 1;
    showMemoryMoment();
  });

  const endButton = document.createElement("button");
  endButton.className = "secondary";
  endButton.textContent = "إنهاء الجلسة الآن";
  endButton.addEventListener("click", finishMemoryJourney);
  actions.append(cueButton, showStoryButton, nextButton, endButton);
  panel.append(actions);
}

function finishMemoryJourney() {
  state.memoryJourney = null;
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  const panel = gameShell(
    "شكرًا على الوقت الجميل ❤️",
    "مفيش نتيجة أو اختبار. ممكن تحتفظوا باللحظة أو تنهوا الجلسة براحتكم."
  );
  const backButton = document.createElement("button");
  backButton.className = "primary";
  backButton.textContent = "العودة للأنشطة";
  backButton.addEventListener("click", () => showPage("games"));
  panel.append(backButton);
}

/* Game 3: ترتيب العيلة */

function startOrderGame() {
  const game = state.game;

  game.queue = shuffle(state.people);
  game.orderAttempts = 0;

  const panel = gameShell(
    "ترتيب العيلة",
    "رتّب أفراد العيلة من الأكبر للأصغر حسب العمر المدخل. تقدر تحرّك كل اسم لفوق أو لتحت."
  );
  addQuestionAudio(
    panel,
    "رتّب أفراد العيلة من الأكبر للأصغر حسب العمر المدخل. تقدر تحرّك كل اسم لفوق أو لتحت."
  );

  if (game.queue.some((person) => !Number.isFinite(person.age))) {
    const warning = document.createElement("p");
    warning.className = "feedback";
    warning.textContent =
      "ملحوظة: بعض الأعمار مش متسجلة؛ النتيجة مش هتتحسب بدقة إلا بعد إدخال الأعمار المعروفة.";
    panel.append(warning);
  }

  const list = document.createElement("div");
  list.className = "order-list";
  list.setAttribute("aria-label", "قائمة ترتيب أفراد العيلة");

  function renderOrderList() {
    list.replaceChildren();

    game.queue.forEach((person, index) => {
      const row = document.createElement("div");
      row.className = "session-row";

      const name = document.createElement("span");
      name.textContent = person.name;

      const controls = document.createElement("div");
      controls.className = "actions";

      const up = document.createElement("button");
      up.className = "secondary";
      up.textContent = "↑";
      up.setAttribute("aria-label", `تحريك ${person.name} لأعلى`);
      up.disabled = index === 0;
      up.addEventListener("click", () => {
        [game.queue[index - 1], game.queue[index]] =
          [game.queue[index], game.queue[index - 1]];
        renderOrderList();
      });

      const down = document.createElement("button");
      down.className = "secondary";
      down.textContent = "↓";
      down.setAttribute("aria-label", `تحريك ${person.name} لأسفل`);
      down.disabled = index === game.queue.length - 1;
      down.addEventListener("click", () => {
        [game.queue[index + 1], game.queue[index]] =
          [game.queue[index], game.queue[index + 1]];
        renderOrderList();
      });

      controls.append(up, down);
      row.append(name, controls);
      list.append(row);
    });
  }

  renderOrderList();
  panel.append(list);

  const feedback = createFeedback(panel);

  const checkButton = document.createElement("button");
  checkButton.className = "primary";
  checkButton.textContent = "تحقق من الترتيب";
  checkButton.addEventListener("click", () => {
    game.orderAttempts += 1;

    const allAgesKnown = game.queue.every((person) =>
      Number.isFinite(person.age)
    );

    if (!allAgesKnown) {
      feedback.textContent =
        "مش هنقدر نقيس الدقة لحد ما الأعمار المعروفة تتسجل. تقدر تنهي الجلسة من غير حساب دقة الترتيب.";
      feedback.className = "feedback bad";
      return;
    }

    const expected = [...game.queue].sort((a, b) => b.age - a.age);
    const correct = game.queue.every(
      (person, index) => person.id === expected[index].id
    );

    recordAnswer(correct, Date.now() - game.questionStartedAt);
    feedback.textContent = correct
      ? "الترتيب صحيح! أحسنت. ❤️"
      : "لسه فيه اختلاف بسيط. جرّب تاني براحتك.";
    feedback.className = `feedback ${correct ? "good" : "bad"}`;

    if (correct) {
      checkButton.disabled = true;
      const finishButton = document.createElement("button");
      finishButton.className = "primary";
      finishButton.textContent = "حفظ النتيجة";
      finishButton.addEventListener("click", () => finishGame(false));
      panel.append(finishButton);
    } else {
      game.questionStartedAt = Date.now();
    }
  });

  panel.append(checkButton);
  addEndButton(panel);
}

/* Save and display research sessions */

function getTimeOfDay() {
  return $("#sessionTime")?.value || "unspecified";
}

function finishGame(manualEnd) {
  const game = state.game;
  if (!game) return;

  const durationMs = Date.now() - game.startedAt;
  const accuracy = game.answered
    ? Math.round((game.correct / game.answered) * 100)
    : null;

  const avgResponseMs = game.responseTimes.length
    ? Math.round(
        game.responseTimes.reduce((sum, value) => sum + value, 0) /
        game.responseTimes.length
      )
    : null;

  const session = {
    id: makeId(),
    participantCode: game.participantCode,
    gameType: game.type,
    difficulty: game.difficulty,
    voiceEnabled: game.autoReadQuestions,
    timeOfDay: getTimeOfDay(),
    date: new Date().toISOString(),
    durationMs,
    accuracy,
    correct: game.correct,
    answered: game.answered,
    hints: game.hints,
    skipped: game.skipped,
    avgResponseMs,
    manuallyEnded: Boolean(manualEnd),
    orderAttempts: game.orderAttempts || 0
  };

  state.sessions.push(session);
  saveSessions();

  state.game = null;
  state.currentGame = null;
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();

  const panel = gameShell("انتهت الجلسة ❤️", "شكرًا لمشاركتك. مفيش إجابة غلط تستدعي الزعل.");

  const summary = document.createElement("div");
  summary.className = "stats-grid";

  const values = [
    ["الإجابات الصحيحة", `${session.correct} من ${session.answered}`],
    ["الدقة", session.accuracy === null ? "غير متاحة" : `${session.accuracy}%`],
    ["التلميحات", String(session.hints)],
    ["الأسئلة المتخطاة", String(session.skipped)],
    ["متوسط زمن الإجابة", session.avgResponseMs === null
      ? "غير متاح"
      : `${(session.avgResponseMs / 1000).toFixed(1)} ثانية`],
    ["مستوى الصعوبة", difficultyName(session.difficulty)],
    ["الوقت الكلي", `${Math.round(session.durationMs / 1000)} ثانية`]
  ];
  values.forEach(([label, value]) => {
    const card = document.createElement("div");
    card.className = "stat-card";

    const title = document.createElement("span");
    title.textContent = label;

    const result = document.createElement("strong");
    result.textContent = value;

    card.append(title, result);
    summary.append(card);
  });

  const message = document.createElement("p");
  message.textContent =
    "النتائج دي وصفية للجلسة دي فقط، ومش تشخيص طبي ولا دليل لوحدها على تحسّن الذاكرة.";

  const researchButton = document.createElement("button");
  researchButton.className = "primary";
  researchButton.textContent = "عرض النتائج";
  researchButton.addEventListener("click", () => showPage("research"));

  panel.append(summary, message, researchButton);
  updateHome();
}

/* Research dashboard */

function renderResearch() {
  const sessions = state.sessions;

  const count = $("#sessionCount");
  const accuracy = $("#averageAccuracy");
  const time = $("#averageTime");
  const list = $("#sessionList");

  if (count) count.textContent = sessions.length;

  const sessionsWithAccuracy = sessions.filter(
    (session) => Number.isFinite(session.accuracy)
  );

  const avgAccuracy = sessionsWithAccuracy.length
    ? Math.round(
        sessionsWithAccuracy.reduce((sum, session) => sum + session.accuracy, 0) /
        sessionsWithAccuracy.length
      )
    : null;

  const sessionsWithTime = sessions.filter(
    (session) => Number.isFinite(session.avgResponseMs)
  );

  const avgTime = sessionsWithTime.length
    ? Math.round(
        sessionsWithTime.reduce((sum, session) => sum + session.avgResponseMs, 0) /
        sessionsWithTime.length
      )
    : null;

  if (accuracy) accuracy.textContent = avgAccuracy === null ? "—" : `${avgAccuracy}%`;
  if (time) time.textContent = avgTime === null ? "—" : `${(avgTime / 1000).toFixed(1)} ث`;

  if (list) {
    list.replaceChildren();

    if (!sessions.length) {
      const empty = document.createElement("p");
      empty.className = "muted";
      empty.textContent = "لسه مفيش جلسات محفوظة.";
      list.append(empty);
    } else {
      [...sessions].reverse().forEach((session) => {
        const row = document.createElement("div");
        row.className = "session-row";

        const details = document.createElement("div");
        const date = new Date(session.date);

        const title = document.createElement("strong");
        title.textContent =
          `${gameName(session.gameType)} — ${session.participantCode}` +
          (session.difficulty ? ` · ${difficultyName(session.difficulty)}` : "");

        const subtitle = document.createElement("div");
        subtitle.className = "muted";
        subtitle.textContent =
          `${date.toLocaleString("ar-EG")} • ${session.timeOfDay}`;

        details.append(title, subtitle);

        const result = document.createElement("span");
        result.textContent = session.accuracy === null
          ? "الدقة: غير متاحة"
          : `الدقة: ${session.accuracy}%`;

        row.append(details, result);
        list.append(row);
      });
    }
  }

  drawChart(sessions);
}

function gameName(type) {
  return ({
    who: "مين ده؟",
    clue: "فاكر الحكاية؟",
    voice: "مين بيتكلم؟",
    order: "ترتيب العيلة"
  })[type] || type;
}

function drawChart(sessions) {
  const canvas = $("#resultsChart");
  if (!canvas) return;

  const width = Math.max(canvas.clientWidth || 600, 300);
  const height = 220;
  const scale = window.devicePixelRatio || 1;

  canvas.width = width * scale;
  canvas.height = height * scale;
  canvas.style.height = `${height}px`;

  const context = canvas.getContext("2d");
  context.scale(scale, scale);
  context.clearRect(0, 0, width, height);

  const data = sessions
    .filter((session) => Number.isFinite(session.accuracy))
    .slice(-10);

  context.fillStyle = "#77736c";
  context.font = "12px Tahoma, Arial";
  context.textAlign = "center";

  if (!data.length) {
    context.fillText("هتظهر النتائج هنا بعد حفظ أول جلسة", width / 2, height / 2);
    return;
  }

  const padding = { top: 25, bottom: 38, left: 32, right: 18 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  [0, 25, 50, 75, 100].forEach((value) => {
    const y = padding.top + chartHeight - (value / 100) * chartHeight;

    context.strokeStyle = "#e7dfd5";
    context.beginPath();
    context.moveTo(padding.left, y);
    context.lineTo(width - padding.right, y);
    context.stroke();

    context.fillStyle = "#77736c";
    context.textAlign = "right";
    context.fillText(`${value}%`, padding.left - 6, y + 4);
  });

  const slot = chartWidth / data.length;
  const barWidth = Math.min(34, slot * 0.55);

  data.forEach((session, index) => {
    const barHeight = (session.accuracy / 100) * chartHeight;
    const x = padding.left + slot * index + (slot - barWidth) / 2;
    const y = padding.top + chartHeight - barHeight;

    context.fillStyle = "#8a6554";
    context.fillRect(x, y, barWidth, barHeight);

    context.fillStyle = "#51463e";
    context.textAlign = "center";
    context.fillText(
      `${session.accuracy}%`,
      x + barWidth / 2,
      Math.max(y - 6, 12)
    );

    context.fillStyle = "#77736c";
    context.fillText(
      String(index + 1),
      x + barWidth / 2,
      height - 15
    );
  });
}

window.addEventListener("resize", () => {
  if (!$("#research")?.classList.contains("hidden")) {
    drawChart(state.sessions);
  }
});

/* CSV and JSON export */

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

$("#exportCsv")?.addEventListener("click", () => {
  const columns = [
    "participantCode",
    "gameType",
    "difficulty",
    "voiceEnabled",
    "timeOfDay",
    "date",
    "durationMs",
    "accuracy",
    "correct",
    "answered",
    "hints",
    "skipped",
    "avgResponseMs",
    "manuallyEnded",
    "orderAttempts"
  ];

  const rows = [
    columns,
    ...state.sessions.map((session) =>
      columns.map((column) => session[column] ?? "")
    )
  ];

  const csv = "\uFEFF" + rows
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n");

  downloadFile("zakerty-sessions.csv", csv, "text/csv;charset=utf-8");
});



async function exportBackup() {
  const backup = {
    app: "Zakerty",
    exportedAt: new Date().toISOString(),
    people: [],
    stories: [],
    sessions: state.sessions
  };

  for (const person of state.people) {
    let imageData = null;
    let audioData = null;

    try {
      const blob = await getPhoto(person.id);
      if (!blob) {
        throw new Error(`الصورة غير متاحة للشخص ${person.name}.`);
      }
      imageData = await blobToDataUrl(blob);
    } catch (error) {
      console.error("Could not export image:", error);
      throw new Error(`تعذر تضمين صورة ${person.name} في النسخة الاحتياطية.`);
    }

    if (person.hasAudio) {
      try {
        const blob = await getAudio(person.id);
        if (!blob) throw new Error("Recording is missing.");
        audioData = await blobToDataUrl(blob);
      } catch (error) {
        console.error("Could not export voice recording:", error);
        throw new Error(`تعذر تضمين تسجيل ${person.name} في النسخة الاحتياطية.`);
      }
    }

    backup.people.push({ ...person, imageData, audioData });
  }

  for (const story of state.stories) {
    let audioData = null;
    if (story.hasAudio) {
      try {
        const blob = await getStoryAudio(story.id);
        if (!blob) throw new Error("Recording is missing.");
        audioData = await blobToDataUrl(blob);
      } catch (error) {
        console.error("Could not export story recording:", error);
        throw new Error(`تعذر تضمين تسجيل الحكاية «${story.title}» في النسخة الاحتياطية.`);
      }
    }
    backup.stories.push({ ...story, audioData });
  }

  if (!crypto.subtle) {
    throw new Error("التشفير غير متاح في هذا المتصفح. افتحوا التطبيق عبر الخادم المحلي.");
  }
  const password = await requestBackupPassword("export");
  if (password === null) return;

  const encrypted = await encryptBackup(backup, password);
  downloadFile(
    "zakerty-backup-encrypted.json",
    JSON.stringify(encrypted, null, 2),
    "application/json;charset=utf-8"
  );
}

function requestBackupPassword(mode) {
  const dialog = $("#backupPasswordDialog");
  const form = $("#backupPasswordForm");
  const passwordInput = $("#backupPassword");
  const confirmationInput = $("#backupPasswordConfirm");
  const confirmationField = $("#backupPasswordConfirmField");
  const error = $("#backupPasswordError");
  const title = $("#backupPasswordTitle");
  const submit = $("#submitBackupPassword");
  const exporting = mode === "export";

  form.reset();
  error.textContent = "";
  title.textContent = exporting ? "تشفير النسخة الاحتياطية" : "فك تشفير النسخة";
  confirmationField.classList.toggle("hidden", !exporting);
  confirmationInput.required = exporting;
  submit.textContent = exporting ? "تشفير وتنزيل" : "استعادة النسخة";
  $("#backupPasswordHelp").textContent = exporting
    ? "اختاروا كلمة مرور لا تقل عن 8 أحرف. لن نستطيع استعادة النسخة من دونها."
    : "أدخلوا كلمة المرور التي استخدمتموها عند إنشاء النسخة.";

  return new Promise((resolve) => {
    const handleSubmit = (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      if (exporting && passwordInput.value !== confirmationInput.value) {
        error.textContent = "كلمتا المرور غير متطابقتين.";
        confirmationInput.focus();
        return;
      }
      dialog.close("accepted");
    };
    const handleClose = () => {
      form.removeEventListener("submit", handleSubmit);
      const password = dialog.returnValue === "accepted" ? passwordInput.value : null;
      form.reset();
      resolve(password);
    };

    form.addEventListener("submit", handleSubmit);
    dialog.addEventListener("close", handleClose, { once: true });
    dialog.returnValue = "";
    dialog.showModal();
    passwordInput.focus();
  });
}

$("#closeBackupPassword")?.addEventListener("click", () => {
  $("#backupPasswordDialog")?.close();
});
$("#cancelBackupPassword")?.addEventListener("click", () => {
  $("#backupPasswordDialog")?.close();
});

async function handleBackupExport() {
  try {
    await exportBackup();
  } catch (error) {
    console.error("Backup export failed:", error);
    alert(error.message || "تعذر تصدير النسخة الاحتياطية.");
  }
}

$("#exportJson")?.addEventListener("click", handleBackupExport);
$("#exportJsonSettings")?.addEventListener("click", handleBackupExport);

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function deriveBackupKey(password, salt) {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 250000, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(value) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

async function encryptBackup(backup, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveBackupKey(password, salt);
  const plaintext = new TextEncoder().encode(JSON.stringify(backup));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    plaintext
  );
  return {
    app: "Zakerty",
    encrypted: true,
    algorithm: "AES-GCM",
    kdf: "PBKDF2-SHA-256",
    iterations: 250000,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext))
  };
}

async function decryptBackup(envelope, password) {
  if (
    envelope.algorithm !== "AES-GCM" ||
    envelope.kdf !== "PBKDF2-SHA-256" ||
    envelope.iterations !== 250000 ||
    typeof envelope.salt !== "string" ||
    typeof envelope.iv !== "string" ||
    typeof envelope.ciphertext !== "string"
  ) {
    throw new Error("صيغة النسخة الاحتياطية المشفّرة غير معروفة.");
  }
  try {
    const key = await deriveBackupKey(password, base64ToBytes(envelope.salt));
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64ToBytes(envelope.iv) },
      key,
      base64ToBytes(envelope.ciphertext)
    );
    return JSON.parse(new TextDecoder().decode(plaintext));
  } catch (error) {
    console.error("Could not decrypt backup:", error);
    throw new Error("تعذر فك النسخة. تأكدوا من كلمة المرور وصحة الملف.");
  }
}

/* Restore a backup from JSON */

async function restoreBackup(file) {
  const text = await file.text();
  let backup = JSON.parse(text);
  if (backup?.encrypted === true) {
    if (!crypto.subtle) {
      throw new Error("فك التشفير غير متاح. افتحوا التطبيق عبر الخادم المحلي.");
    }
    const password = await requestBackupPassword("restore");
    if (password === null) return false;
    backup = await decryptBackup(backup, password);
  }

  if (!backup || !Array.isArray(backup.people) || !Array.isArray(backup.sessions)) {
    throw new Error("ملف النسخة الاحتياطية غير صالح.");
  }
  const backupStories = backup.stories || [];
  if (!Array.isArray(backupStories)) {
    throw new Error("قائمة الحكايات في النسخة الاحتياطية غير صالحة.");
  }

  const ids = new Set();
  for (const person of backup.people) {
    if (
      !person ||
      typeof person.id !== "string" ||
      !person.id ||
      typeof person.name !== "string" ||
      !person.name.trim() ||
      typeof person.relation !== "string" ||
      !person.relation.trim() ||
      (person.birthday && !isValidBirthday(person.birthday)) ||
      ids.has(person.id)
    ) {
      throw new Error("بيانات أحد أفراد العيلة في النسخة غير صالحة.");
    }

    if (
      typeof person.imageData !== "string" ||
      !person.imageData.startsWith("data:image/")
    ) {
      throw new Error(`صورة ${person.name} غير موجودة في النسخة الاحتياطية.`);
    }

    if (
      person.audioData !== undefined &&
      person.audioData !== null &&
      (typeof person.audioData !== "string" ||
        !person.audioData.startsWith("data:audio/"))
    ) {
      throw new Error(`التسجيل الصوتي لـ ${person.name} غير صالح.`);
    }

    ids.add(person.id);
  }

  const storyIds = new Set();
  for (const story of backupStories) {
    if (
      !story ||
      typeof story.id !== "string" ||
      !story.id ||
      storyIds.has(story.id) ||
      typeof story.title !== "string" ||
      !story.title.trim() ||
      typeof story.text !== "string" ||
      !story.text.trim() ||
      typeof story.personId !== "string" ||
      (story.date && !/^\d{4}-\d{2}-\d{2}$/.test(story.date)) ||
      (story.audioData !== undefined &&
        story.audioData !== null &&
        (typeof story.audioData !== "string" || !story.audioData.startsWith("data:audio/")))
    ) {
      throw new Error("بيانات إحدى الحكايات في النسخة الاحتياطية غير صالحة.");
    }
    storyIds.add(story.id);
  }

  const restoredPeople = [];
  const restoredPhotos = [];
  const restoredAudio = [];
  const restoredStories = [];
  const restoredStoryAudio = [];
  for (const person of backup.people) {
    const response = await fetch(person.imageData);
    const blob = await response.blob();
    if (!blob.type.startsWith("image/") || blob.size > 12 * 1024 * 1024) {
      throw new Error(`صورة ${person.name} غير صالحة أو أكبر من 12 ميجابايت.`);
    }
    restoredPhotos.push({ id: person.id, blob });
    if (person.audioData) {
      const audioResponse = await fetch(person.audioData);
      const audioBlob = await audioResponse.blob();
      if (!audioBlob.type.startsWith("audio/") || audioBlob.size > MAX_AUDIO_SIZE) {
        throw new Error(`تسجيل ${person.name} غير صالح أو أكبر من 12 ميجابايت.`);
      }
      restoredAudio.push({ id: person.id, blob: audioBlob });
    }
    const { imageData, audioData, ...metadata } = person;
    restoredPeople.push({ ...metadata, hasAudio: Boolean(audioData) });
  }
  for (const story of backupStories) {
    if (story.audioData) {
      const audioResponse = await fetch(story.audioData);
      const audioBlob = await audioResponse.blob();
      if (!audioBlob.type.startsWith("audio/") || audioBlob.size > MAX_AUDIO_SIZE) {
        throw new Error(`تسجيل حكاية «${story.title}» غير صالح أو أكبر من 12 ميجابايت.`);
      }
      restoredStoryAudio.push({ id: story.id, blob: audioBlob });
    }
    const { audioData, ...metadata } = story;
    restoredStories.push({ ...metadata, hasAudio: Boolean(audioData) });
  }

  const previousPeople = state.people;
  const previousSessions = state.sessions;
  const previousStories = state.stories;
  const previousPeopleStorage = localStorage.getItem(STORAGE_KEY);
  const previousSessionsStorage = localStorage.getItem(SESSIONS_KEY);
  const previousStoriesStorage = localStorage.getItem(STORIES_KEY);

  for (const photo of restoredPhotos) {
    await savePhoto(photo.id, photo.blob);
  }
  const restoredAudioIds = new Set(restoredAudio.map((recording) => recording.id));
  for (const person of restoredPeople) {
    if (!restoredAudioIds.has(person.id)) await deleteAudio(person.id);
  }
  for (const recording of restoredAudio) {
    await saveAudio(recording.id, recording.blob);
  }
  for (const story of restoredStories) {
    if (!restoredStoryAudio.some((recording) => recording.id === story.id)) {
      await deleteStoryAudio(story.id);
    }
  }
  for (const recording of restoredStoryAudio) {
    await saveStoryAudio(recording.id, recording.blob);
  }

  state.people = restoredPeople;
  state.sessions = backup.sessions;
  state.stories = restoredStories;

  try {
    savePeople();
    saveSessions();
    saveStories();
  } catch (error) {
    state.people = previousPeople;
    state.sessions = previousSessions;
    state.stories = previousStories;
    try {
      if (previousPeopleStorage === null) {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        localStorage.setItem(STORAGE_KEY, previousPeopleStorage);
      }

      if (previousSessionsStorage === null) {
        localStorage.removeItem(SESSIONS_KEY);
      } else {
        localStorage.setItem(SESSIONS_KEY, previousSessionsStorage);
      }
      if (previousStoriesStorage === null) {
        localStorage.removeItem(STORIES_KEY);
      } else {
        localStorage.setItem(STORIES_KEY, previousStoriesStorage);
      }
    } catch (rollbackError) {
      console.error("Could not roll back local storage after restore:", rollbackError);
    }
    throw error;
  }

  const restoredIds = new Set(restoredPeople.map((person) => person.id));
  await Promise.all(
    previousPeople
      .filter((person) => !restoredIds.has(person.id))
      .flatMap((person) => [deletePhoto(person.id), deleteAudio(person.id)])
  );
  const restoredStoryIds = new Set(restoredStories.map((story) => story.id));
  await Promise.all(
    previousStories
      .filter((story) => !restoredStoryIds.has(story.id))
      .map((story) => deleteStoryAudio(story.id))
  );

  await renderFamily();
  await renderStories();
  renderResearch();
  updateHome();
  return true;
}

/* Settings */

$("#backupBtn")?.addEventListener("click", () => {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json,application/json";

  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;

    if (!confirm("استعادة النسخة هتستبدل البيانات الحالية. هل عملتي نسخة من بياناتك الحالية؟")) {
      return;
    }

    try {
      const restored = await restoreBackup(file);
      if (restored) alert("تمت استعادة النسخة الاحتياطية.");
    } catch (error) {
      console.error(error);
      alert(error.message || "محصلش استعادة للنسخة. اتأكدي إن الملف نسخة صحيحة من ذاكرتي.");
    }
  });

  input.click();
});

function applyAccessibilitySettings() {
  const settings = readStorage(ACCESSIBILITY_KEY, {}) || {};
  const fontSize = Number(settings.fontSize);
  const size = Number.isFinite(fontSize) ? Math.min(22, Math.max(14, fontSize)) : 16;
  document.documentElement.style.setProperty("--base-font-size", `${size}px`);
  document.body.classList.toggle("high-contrast", settings.highContrast === true);
  const contrastInput = $("#highContrast");
  if (contrastInput) contrastInput.checked = settings.highContrast === true;
}

function updateAccessibilitySettings(change) {
  const current = readStorage(ACCESSIBILITY_KEY, {}) || {};
  const next = { ...current, ...change };
  try {
    localStorage.setItem(ACCESSIBILITY_KEY, JSON.stringify(next));
    applyAccessibilitySettings();
  } catch (error) {
    console.error("Could not save accessibility settings:", error);
    alert("تعذر حفظ إعداد سهولة القراءة على هذا الجهاز.");
  }
}

$("#fontDecrease")?.addEventListener("click", () => {
  const settings = readStorage(ACCESSIBILITY_KEY, {}) || {};
  const current = Number.isFinite(Number(settings.fontSize)) ? Number(settings.fontSize) : 16;
  updateAccessibilitySettings({ fontSize: Math.max(14, current - 1) });
});
$("#fontIncrease")?.addEventListener("click", () => {
  const settings = readStorage(ACCESSIBILITY_KEY, {}) || {};
  const current = Number.isFinite(Number(settings.fontSize)) ? Number(settings.fontSize) : 16;
  updateAccessibilitySettings({ fontSize: Math.min(22, current + 1) });
});
$("#fontReset")?.addEventListener("click", () => {
  updateAccessibilitySettings({ fontSize: 16 });
});
$("#highContrast")?.addEventListener("change", (event) => {
  updateAccessibilitySettings({ highContrast: event.target.checked });
});

$("#clearDataBtn")?.addEventListener("click", async () => {
  const confirmation = prompt(
    "لحذف بيانات الأشخاص والجلسات من الجهاز، اكتبي: حذف"
  );

  if (confirmation !== "حذف") return;

  const ids = state.people.map((person) => person.id);
  const storyIds = state.stories.map((story) => story.id);

  state.people = [];
  state.sessions = [];
  state.stories = [];

  savePeople();
  saveSessions();
  saveStories();

  await Promise.all(
    ids.flatMap((id) => [deletePhoto(id), deleteAudio(id)])
  );
  await Promise.all(storyIds.map((id) => deleteStoryAudio(id)));

  await renderFamily();
  await renderStories();
  renderResearch();
  updateHome();

  alert("تم حذف البيانات المحلية المسجلة في التطبيق.");
});

/* Optional service worker: offline caching after first visit */

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((error) => {
      console.warn("Offline support could not be enabled:", error);
    });
  });
}

/* Initial load */

async function init() {
  const status = $(".status");

  try {
    await openPhotoDB();
    if (status) status.textContent = "البيانات محفوظة على هذا الجهاز";
  } catch {
    if (status) status.textContent = "تخزين الصور غير متاح في هذا المتصفح";
  }

  updateHome();
  renderResearch();
  applyAccessibilitySettings();
  await renderStories();
  await renderFamily();
  await loadReminderSettings();
}

init();
