import './App.css';

import React, { useState, useEffect } from "react";

export default function App() {
  const [data, setData] = useState(null);
  const [explorers, setExplorers] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null); 
  

  useEffect(() => {
    const getData = async () => {
      try {
        const response = await fetch(
          'http://164.92.144.155:9661/api/data'
        );
        if (!response.ok) {
          throw new Error(
            `This is an HTTP error: The status is ${response.status}`
          );
        }
        let actualData = await response.json();
        setData(actualData.data.balances);
        setExplorers(actualData.data.explorers);
        setError(null);
      } catch(err) {
        setError(err.message);
        setData(null);
      } finally {
        setLoading(false);
      }  
    }
    getData()
  
  }, [])

  return (
    <div className="App">
      <h1>Balance Checker</h1>
      {loading && <div>A moment please...</div>}
      {error && (
        <div>{`There is a problem fetching the post data - ${error}`}</div>
      )}
      <div class="wrapper">
        <div>
          <h2>Flux Balances</h2>
          <table class="center">
            <tr>
              <th>Label</th>
              <th>Address</th>
              <th>Balance</th>
            </tr>
            {data && Object.values(data).map(({coin, label, address, ALERT, balance}, key) => {
              if (coin === 'FLUX') {
                var alert = balance < ALERT;
                if (ALERT === 0 ) {
                  alert = false;
                }
                var link = `${explorers[coin]}${address}`;
                return (
                  <tr key={key}>
                    <td bgcolor={alert ? 'red' : ''}>{label}</td>
                    <td bgcolor={alert ? 'red' : ''}><a href={link}>{address}</a></td>
                    <td bgcolor={alert ? 'red' : ''}>{balance}</td>
                  </tr>
                )
              }
              return null;
            })}
          </table>
        </div>
        <div>
          <h2>BSC Balances</h2>
          <table class="center">
            <tr>
              <th>Label</th>
              <th>Address</th>
              <th>Balance</th>
            </tr>
            {data && Object.values(data).map(({coin, label, address, ALERT, balance}, key) => {
              if (coin === 'BSC') {
                var alert = balance < ALERT;
                if (ALERT === 0 ) {
                  alert = false;
                }
                var link = `${explorers[coin]}${address}`;
                return (
                  <tr key={key}>
                    <td bgcolor={alert ? 'red' : ''}>{label}</td>
                    <td bgcolor={alert ? 'red' : ''}><a href={link}>{address}</a></td>
                    <td bgcolor={alert ? 'red' : ''}>{balance}</td>
                  </tr>
                )
              }
              return null;
            })}
          </table>
        </div>
      <div>
        <h2>ETH Balances</h2>
        <table class="center">
          <tr>
            <th>Label</th>
            <th>Address</th>
            <th>Balance</th>
          </tr>
          {data && Object.values(data).map(({coin, label, address, ALERT, balance}, key) => {
            if (coin === 'ETH') {
              var alert = balance < ALERT;
                if (ALERT === 0 ) {
                  alert = false;
                }
                var link = `${explorers[coin]}${address}`;
                return (
                  <tr key={key}>
                    <td bgcolor={alert ? 'red' : ''}>{label}</td>
                    <td bgcolor={alert ? 'red' : ''}><a href={link}>{address}</a></td>
                    <td bgcolor={alert ? 'red' : ''}>{balance}</td>
                  </tr>
                )
            } else {
              return null;
            }
          })}
        </table>
      </div>
      <div>
        <h2>TRON Balances</h2>
        <table class="center">
          <tr>
            <th>Label</th>
            <th>Address</th>
            <th>Balance</th>
          </tr>
          {data && Object.values(data).map(({coin, label, address, ALERT, balance}, key) => {
            if (coin === 'TRON'){
              var alert = balance < ALERT;
              if (ALERT === 0 ) {
                alert = false;
              }
              var link = `${explorers[coin]}${address}`;
                return (
                  <tr key={key}>
                    <td bgcolor={alert ? 'red' : ''}>{label}</td>
                    <td bgcolor={alert ? 'red' : ''}><a href={link}>{address}</a></td>
                    <td bgcolor={alert ? 'red' : ''}>{balance}</td>
                  </tr>
                )
            }
            return null;
          })}
        </table>
      </div>
      <div>
        <h2>SOL Balances</h2>
        <table class="center">
          <tr>
            <th>Label</th>
            <th>Address</th>
            <th>Balance</th>
          </tr>
          {data && Object.values(data).map(({coin, label, address, ALERT, balance}, key) => {
            if (coin === 'SOL'){
              var alert = balance < ALERT;
              if (ALERT === 0 ) {
                alert = false;
              }
              var link = `${explorers[coin]}${address}`;
              return (
                <tr key={key}>
                  <td bgcolor={alert ? 'red' : ''}>{label}</td>
                  <td bgcolor={alert ? 'red' : ''}><a href={link}>{address}</a></td>
                  <td bgcolor={alert ? 'red' : ''}>{balance}</td>
                </tr>
              )
            }
            return null;
          })}
        </table>
      </div>
      </div>
    </div>
  );
}
