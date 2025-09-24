(function () {
    // Helper to safely remove modal
     
  
    // Custom alert
    window.alert = function (message) {
      return new Promise((resolve) => {
        const modalId = `custom-alert`;
        const modal = document.createElement('div');
        modal.id = modalId;
        modal.innerHTML = `
          <div style="margin-bottom: 15px;">${message}</div>
          <button id="${modalId}-ok">OK</button>
        `;
        Object.assign(modal.style, {
          position: 'fixed',
          top: '20%',
          left: '50%',
          transform: 'translateX(-50%)',
          backgroundColor: '#fff',
          padding: '20px 30px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
          borderRadius: '10px',
          zIndex: 9999,
        });
    
        document.body.appendChild(modal);
    
        // Delay binding to ensure DOM is painted
        setTimeout(() => {
          const okButton = document.getElementById(`${modalId}-ok`);
          if (!okButton) return resolve();
    
          okButton.addEventListener('click', () => {
            modal.remove();
            resolve();
          });
        }, 50); // ← ensures button exists and is clickable
      });
    };
    
  
    // Custom confirm
    window.confirm = function (message) {
      return new Promise((resolve) => {
        const modalId = `custom-confirm`;
        const modal = document.createElement('div');
        modal.id = modalId;
        modal.innerHTML = `
          <div style="margin-bottom: 15px;">${message}</div>
          <button id="${modalId}-yes" style="margin-right: 10px;">Yes</button>
          <button id="${modalId}-no">No</button>
        `;
        Object.assign(modal.style, {
          position: 'fixed',
          top: '20%',
          left: '50%',
          transform: 'translateX(-50%)',
          backgroundColor: '#fff',
          padding: '20px 30px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
          borderRadius: '10px',
          zIndex: 9999,
        });
    
        document.body.appendChild(modal);
    
        // Allow DOM to fully render and buttons to bind
        setTimeout(() => {
          const yesBtn = document.getElementById(`${modalId}-yes`);
          const noBtn = document.getElementById(`${modalId}-no`);
    
          const cleanup = () => modal.remove();
    
          yesBtn?.addEventListener('click', () => {
            cleanup();
            resolve(true);
          });
          noBtn?.addEventListener('click', () => {
            cleanup();
            resolve(false);
          });
        }, 50); // ← important for automation
      });
    };
    
  
    // Custom prompt
    window.prompt = function (message, defaultValue = '') {
      return new Promise((resolve) => {
        const modalId = `custom-prompt`;
        const modal = document.createElement('div');
        modal.id = modalId;
        modal.innerHTML = `
          <div style="margin-bottom: 10px;">${message}</div>
          <input id="${modalId}-input" type="text" value="${defaultValue}" style="margin-bottom: 10px; width: 100%;" />
          <br/>
          <button id="${modalId}-ok" style="margin-right: 10px;">OK</button>
          <button id="${modalId}-cancel">Cancel</button>
        `;
        Object.assign(modal.style, {
          position: 'fixed',
          top: '20%',
          left: '50%',
          transform: 'translateX(-50%)',
          backgroundColor: '#fff',
          padding: '20px 30px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
          borderRadius: '10px',
          zIndex: 9999,
        });
    
        document.body.appendChild(modal);
    
        setTimeout(() => {
          const input = document.getElementById(`${modalId}-input`);
          const okBtn = document.getElementById(`${modalId}-ok`);
          const cancelBtn = document.getElementById(`${modalId}-cancel`);
    
          const cleanup = () => modal.remove();
    
          okBtn?.addEventListener('click', () => {
            const finalValue = input.value; // ✅ Use updated value
            cleanup();
            resolve(finalValue); // ✅ return latest input
          });
    
          cancelBtn?.addEventListener('click', () => {
            cleanup();
            resolve(null);
          });
    
          input.focus();
        }, 50); // important for automation timing
      });
    };
    
    
  })();