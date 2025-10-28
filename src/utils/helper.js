export async function injectScript(file) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL(file);
      script.onload = () => {
        script.remove();
        resolve();
      };
      script.onerror = (err) => reject(err);
      (document.head || document.documentElement).appendChild(script);
    });
  }
  export async function cropImage(imgData, rect) {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = imgData;
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = rect.width;
      canvas.height = rect.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(
        img,
        rect.x,
        rect.y,
        rect.width,
        rect.height,
        0,
        0,
        rect.width,
        rect.height
      );
      resolve(canvas.toDataURL("image/png"));
    };
  });
}
 
export function sendMessagePromise(message) {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve(response);
      });
    } catch (err) {
      reject(err);
    }
  });
}
export async function captureAndUpload(rect, isAction = false) {
  try {
    // Step 1: capture screenshot
    const { dataUrl } = await sendMessagePromise({ command: "CAPTURE_PAGE" });
    if (!dataUrl) throw new Error("No screenshot captured");

    // Step 2: crop selected area
    const cropped = await cropImage(dataUrl, rect);

    // Step 3: upload cropped image
    const { url } = await sendMessagePromise({
      command: "UPLOAD_SCREENSHOT",
      cropped,
      rect,
      isAction,
    });

    console.log("✅ Uploaded URL:", url);
    return url;
  } catch (err) {
    console.error("❌ Capture/upload failed:", err);
  }
}
export const compare = async (oldUrl, newUrl) => {
  const response = await fetch(
    "https://mggvulbvgteamxghjoce.supabase.co/functions/v1/compare-images",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oldImageUrl: oldUrl, newImageUrl: newUrl }),
    }
  );

  const result = await response.json();
  console.log("Gemini comparison:", result);
  return result;
};


 