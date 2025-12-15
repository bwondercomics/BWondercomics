export function initEmailSignupForm() {
  const form = document.getElementById('emailSignupForm');
  const messageDiv = document.getElementById('emailFormMessage');

  if (!form) return;

  form.addEventListener('submit', async function (e) {
    e.preventDefault();

    const emailInput = document.getElementById('emailInput');
    const submitBtn = form.querySelector('.email-submit-btn');
    const email = emailInput.value.trim();

    if (!email) return;

    submitBtn.disabled = true;
    submitBtn.textContent = 'SENDING...';
    messageDiv.style.display = 'none';

    try {
      const response = await fetch(form.action, {
        method: 'POST',
        body: new FormData(form),
        headers: {
          'Accept': 'application/json'
        }
      });

      if (response.ok) {
        messageDiv.textContent = 'Thanks for signing up! Check your inbox!';
        messageDiv.className = 'email-form-message success';
        messageDiv.style.display = 'block';
        emailInput.value = '';

        setTimeout(() => {
          messageDiv.style.display = 'none';
        }, 5000);
      } else {
        throw new Error('Form submission failed');
      }
    } catch (error) {
      messageDiv.textContent = 'Oops! Something went wrong. Try again?';
      messageDiv.className = 'email-form-message error';
      messageDiv.style.display = 'block';

      setTimeout(() => {
        messageDiv.style.display = 'none';
      }, 5000);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'SUBMIT';
    }
  });
}
