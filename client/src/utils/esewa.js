/**
 * eSewa's ePay v2 endpoint only accepts a real form POST, so the browser is
 * navigated away by submitting a hidden form built from the server's signed
 * payload. Never build or modify these fields client-side — the signature is
 * computed on the server from the merchant secret.
 */
export const submitEsewaForm = ({ formUrl, fields }) => {
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = formUrl;
  form.style.display = 'none';

  Object.entries(fields).forEach(([name, value]) => {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    form.appendChild(input);
  });

  document.body.appendChild(form);
  form.submit();
};
