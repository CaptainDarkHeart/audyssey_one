import { state } from './state.js';

export const baseUrl = 'http://localhost:4735/measurements';
export const speedDelay = 255;

async function enableBlock() {
  await fetch('http://localhost:4735/application/blocking', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: true
  });
}
async function fetch_mREW(indice = null, method = 'GET', _body = null) {
  let body;
  let requestUrl;
  if (indice === null) { requestUrl = baseUrl; } else { requestUrl = baseUrl + `/${indice}`; }
  if (method === 'PUT') { body = _body; }
  const deadline = Date.now() + 60_000;
  while (true) {
    if (Date.now() > deadline) throw new Error(`fetch_mREW ${method} ${requestUrl} timed out after 60s`);
    try {
      const response = await fetch(requestUrl, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!response.ok) {
        await new Promise(resolve => setTimeout(resolve, speedDelay));
      } else {
        return response.json();
      }
    } catch (error) {
      throw new Error(`fetch_mREW ${method} ${requestUrl} failed: ${error.message}`, { cause: error });
    }
  }
}
async function postNext(processName, indices, parameters = null) {
  let requestUrl;
  let body;
  if (Array.isArray(indices)) {
    requestUrl = `${baseUrl}/process-measurements`;
  } else {
    requestUrl = parameters === null ? `${baseUrl}/${indices}/eq/command` : `${baseUrl}/${indices}/command`;
  }
  if (requestUrl.endsWith('/command')) {
    body = { command: processName };
  } else {
    body = { processName: processName };
  }
  if (parameters != null) {
    body = { ...body, parameters: parameters };
  }
  if (Array.isArray(indices)) {
    body = { ...body, measurementIndices: indices };
  }
  const fetchData = async () => {
    const response = await fetch(requestUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error('Network response was not OK!');
    }
    const data = await response.json();
    return data;
  };
  try {
    const deadline = Date.now() + 180_000;
    let data = await fetchData();
    while (data.message && (data.message.includes('in progress') || data.message.includes('running'))) {
      if (Date.now() > deadline) throw new Error(`postNext '${processName}' timed out after 180s`);
      await new Promise((resolve) => setTimeout(resolve, speedDelay));
      data = await fetchData();
    }
    if (data.message && data.message.includes('ompleted')) {
      const resultUrl = `${baseUrl}/process-result`;
      const resultResponse = await fetch(resultUrl);
      if (!resultResponse.ok) {
        throw new Error('Failed to fetch result data!');
      }
      return await resultResponse.json();
    }
    return data;
  } catch (error) {
    throw new Error(`postNext '${processName}' failed: ${error.message}`, { cause: error });
  }
}
async function postNext2(processName, indices, parameters = null) {
  let requestUrl;
  let body;
  requestUrl = `${baseUrl}/${indices}/command`;
  body = { command: processName };
  body = { ...body, parameters: parameters };
  const fetchData = async () => {
    const response = await fetch(requestUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error('Network response was not OK!');
    }
    const data = await response.json();
    return data;
  };
  try {
    const deadline = Date.now() + 180_000;
    let data = await fetchData();
    while (data.message && (data.message.includes('in progress') || data.message.includes('running'))) {
      if (Date.now() > deadline) throw new Error(`postNext2 '${processName}' timed out after 180s`);
      await new Promise((resolve) => setTimeout(resolve, speedDelay));
      data = await fetchData();
    }
    if (data.message && data.message.includes('ompleted')) {
      const resultUrl = `${baseUrl}/process-result`;
      const resultResponse = await fetch(resultUrl);
      if (!resultResponse.ok) {
        throw new Error('Failed to fetch result data!');
      }
      return await resultResponse.json();
    }
    return data;
  } catch (error) {
    throw new Error(`postNext2 '${processName}' failed: ${error.message}`, { cause: error });
  }
}
async function postSafe(requestUrl, parameters, message) {
  const fetchData = async () => {
    const response = await fetch(requestUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parameters),
    });
    if (!response.ok) {
      throw new Error(`Network response was not OK (HTTP ${response.status})`);
    }
    return response.json();
  };
  try {
    const deadline = Date.now() + 120_000;
    let data = await fetchData();
    while (data.message && (data.message.includes('in progress') || data.message.includes('running'))) {
      if (Date.now() > deadline) throw new Error(`postSafe '${message}' timed out after 120s`);
      await new Promise((resolve) => setTimeout(resolve, speedDelay));
      data = await fetchData();
    }
    if (!data.message || !data.message.includes(message)) {
      throw new Error(`Unexpected response: ${data.message}`);
    }
    return data;
  } catch (error) {
    throw new Error(`postSafe ${requestUrl} failed: ${error.message}`, { cause: error });
  }
}
async function postDelete(indice) {
  const mDeleted = `Measurement ${indice} deleted`;
  const deadline = Date.now() + 60_000;
  while (true) {
    if (Date.now() > deadline) throw new Error(`postDelete ${indice} timed out after 60s`);
    try {
      const response = await fetch(`${baseUrl}/${indice}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) {
        throw new Error(`Network response was not OK (HTTP ${response.status})`);
      }
      const data = await response.json();
      if (data.message === mDeleted) {
        return indice;
      } else {
        await new Promise(resolve => setTimeout(resolve, speedDelay));
      }
    } catch (error) {
      throw new Error(`postDelete ${indice} failed: ${error.message}`, { cause: error });
    }
  }
}
async function fetchSafe(extUrl, indice, parameters = null) {
  const requestUrl = `${baseUrl}/${indice}/${extUrl}`;
  let options;
  if (parameters === null) {
    options = { method: 'GET' };
  } else {
    options = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parameters)
    };
  }
  const deadline = Date.now() + 60_000;
  while (true) {
    if (Date.now() > deadline) throw new Error(`fetchSafe ${extUrl}/${indice} timed out after 60s`);
    try {
      const response = await fetch(requestUrl, options);
      if (!response.ok) {
        await new Promise(resolve => setTimeout(resolve, speedDelay));
      } else {
        return response.json();
      }
    } catch (error) {
      throw new Error(`fetchSafe ${extUrl}/${indice} failed: ${error.message}`, { cause: error });
    }
  }
}
async function postAlign(processName, frequency = null) {
  const requestUrl = `http://localhost:4735/alignment-tool/command`;
  const body = { command: processName };
  if (frequency != null) {
    body.frequency = frequency;
  }
  try {
    const response = await fetch(requestUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const responseText = await response.text();
    if (!response.ok) {
      let errorData;
      try {
        errorData = JSON.parse(responseText);
      } catch (parseError) {
        throw new Error('Network response was not OK!');
      }
      if (errorData.message) {
        let parsedMessage;
        try {
          parsedMessage = JSON.parse(errorData.message);
        } catch (parseError) {
          throw new Error('Failed to parse the error message');
        }
        if (parsedMessage.results && parsedMessage.results[0] && parsedMessage.results[0].Error) {
          const errorMessage = parsedMessage.results[0].Error;
          const delayMatch = errorMessage.match(/delay required to align the responses.*(-?[\d.]+) ms/);
          if (delayMatch) {
            return { message: 'Delay too large', error: errorMessage, delay: parseFloat(delayMatch[1]) };
          }
        }
      }
      throw new Error('Network response was not OK!');
    }
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      throw new Error('Failed to parse the response data');
    }
    if (data.message && data.message.includes('completed')) {
      const resultUrl = `http://localhost:4735/alignment-tool/result`;
      const resultResponse = await fetch(resultUrl);
      if (!resultResponse.ok) {
        throw new Error('Failed to fetch result data!');
      }
      const resultData = await resultResponse.json();
      if (resultData.results && resultData.results[0] && resultData.results[0].Error) {
        const errorMessage = resultData.results[0].Error;
        const delayMatch = errorMessage.match(/delay required to align the responses.*(-?[\d.]+) ms/);
        if (delayMatch) {
          return { message: 'Delay too large', error: errorMessage, delay: parseFloat(delayMatch[1]) };
        }
      }
      return resultData;
    }
    return data;
  } catch (error) {
    console.error('Error in postAlign:', error);
    throw error;
  }
}
async function fetchAlign(extUrl) {
  try {
    const requestUrl = `http://localhost:4735/alignment-tool/${extUrl}`;
    const response = await fetch(requestUrl, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }
    return response.json();
  } catch (error) {
    throw new Error(`fetchAlign ${extUrl} failed: ${error.message}`, { cause: error });
  }
}
async function disableBlock() {
  await fetch('http://localhost:4735/application/blocking', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: false
  });
}
async function disableGraph() {
  await fetch('http://localhost:4735/application/inhibit-graph-updates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: true
  });
}
async function enableGraph() {
  await fetch('http://localhost:4735/application/inhibit-graph-updates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: false
  });
}
async function clearCommands() {
  const body = { command: 'Clear command in progress' };
  await fetch('http://localhost:4735/application/command', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

export {
  enableBlock, fetch_mREW, postNext, postNext2, postSafe, postDelete,
  fetchSafe, postAlign, fetchAlign, disableBlock, disableGraph, enableGraph,
  clearCommands,
};
