export  function showOverlay() {
    let overlay = document.getElementById("loading-overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "loading-overlay";
  
      overlay.style.position = "fixed";
      overlay.style.top = "0";
      overlay.style.left = "0";
      overlay.style.width = "100%";
      overlay.style.height = "100%";
      overlay.style.zIndex = "999999";
      overlay.style.display = "flex";
      overlay.style.alignItems = "center";
      overlay.style.justifyContent = "center";
  
      // Strong blurry background
      overlay.style.background = "rgba(0, 0, 0, 0.15)";
      overlay.style.backdropFilter = "blur(6px)";   // ⬅️ stronger blur
      overlay.style.webkitBackdropFilter = "blur(6px)";
  
      // Loading box
      const box = document.createElement("div");
      box.style.padding = "24px 48px";
      box.style.background = "rgba(0, 0, 0, 0.35)";
      box.style.borderRadius = "16px";
      box.style.color = "white";
      box.style.fontSize = "20px";
      box.style.display = "flex";
      box.style.flexDirection = "column";
      box.style.alignItems = "center";
      box.style.boxShadow = "0 8px 30px rgba(0,0,0,0.4)";
  
      // Spinner
      const spinner = document.createElement("div");
      spinner.style.width = "48px";
      spinner.style.height = "48px";
      spinner.style.border = "5px solid rgba(255, 255, 255, 0.3)";
      spinner.style.borderTop = "5px solid white";
      spinner.style.borderRadius = "50%";
      spinner.style.animation = "spin 1s linear infinite";
  
      // Keyframes for spinner
      const style = document.createElement("style");
      style.innerHTML = `
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `;
      document.head.appendChild(style);
  
      const text = document.createElement("div");
      text.innerText = "Loading...";
      text.style.marginTop = "14px";
      text.style.fontSize = "22px";
      text.style.fontWeight = "500";
  
      box.appendChild(spinner);
      box.appendChild(text);
      overlay.appendChild(box);
      document.body.appendChild(overlay);
    }
  }
  
  export  function hideOverlay() {
    const overlay = document.getElementById("loading-overlay");
    if (overlay) {
      overlay.remove();
    }
  }