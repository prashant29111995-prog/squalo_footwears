(function () {
  "use strict";

  const storeId = document
    .getElementById("stockSetupContext")
    .getAttribute("data-store-id");

  const BASE = "/pos/stores/" + encodeURIComponent(storeId) +
    "/stock/setup";

  const batchSelect = document.getElementById("setupBatch");
  const rowsBody = document.getElementById("allocationRows");
  const locationBody = document.getElementById("setupLocations");
  const message = document.getElementById("setupMessage");
  const verifyButton = document.getElementById("verifyAllocation");
  const addButton = document.getElementById("addAllocationRow");

  let batches = [];
  let racks = [];
  let locations = [];
  let selectedBatch = null;
  let busy = false;
  let loading = false;
  let locationSaves = 0;

  function money(paise) {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
    }).format(paise / 100);
  }

  async function api(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        ...(options.body
          ? { "Content-Type": "application/json" }
          : {}),
      },
    });

    const type = response.headers.get("content-type") || "";

    if (response.redirected || !type.includes("application/json")) {
      throw new Error("Session expired. Sign in again.");
    }

    const result = await response.json();

    if (!response.ok || !result.ok) {
      throw new Error(result.message || "Request failed");
    }

    return result;
  }

  function setMessage(value, error) {
    message.textContent = value;
    message.style.color = error ? "#b42318" : "#18794e";
  }

  function updateCount() {
    const total = Array.from(
      rowsBody.querySelectorAll(".count-qty")
    ).reduce(function (sum, input) {
      const value = Number(input.value);
      return sum + (Number.isFinite(value) ? value : 0);
    }, 0);

    document.getElementById("countSummary").textContent =
      selectedBatch
        ? "Ledger: " + selectedBatch.qty +
          " pairs · Counted: " + total +
          " · Difference: " + (selectedBatch.qty - total)
        : "Select a batch.";

    verifyButton.disabled =
      busy ||
      loading ||
      locationSaves > 0 ||
      !selectedBatch ||
      total !== selectedBatch.qty ||
      rowsBody.children.length === 0;

    addButton.disabled = busy || loading || !selectedBatch;
  }

  function setLocked(locked) {
    document.querySelectorAll(
      "#allocationForm input, #allocationForm select, " +
      "#allocationForm button, #setupBatch, #batchSearch, " +
      "#setupLocations select, #setupLocations button"
    ).forEach(function (element) {
      element.disabled = locked;
    });

    if (!locked) updateCount();
  }

  function appendOptions(select, items) {
    items.forEach(function (item) {
      select.add(new Option(item.label, item.value));
    });
  }

  function addRow() {
    if (!selectedBatch || busy || loading) return;

    const row = document.createElement("tr");

    const size = document.createElement("input");
    size.className = "count-size";
    size.required = true;
    size.maxLength = 30;
    size.placeholder = "e.g. 8";

    const system = document.createElement("select");
    system.className = "count-system";

    appendOptions(system, ["UK", "EU", "US", "LABEL"].map(
      (value) => ({ value, label: value })
    ));

    const condition = document.createElement("select");
    condition.className = "count-condition";

    appendOptions(condition, [
      { value: "FRESH", label: "Fresh" },
      { value: "FACTORY_SECOND", label: "Factory Second" },
      { value: "DAMAGED", label: "Damaged" },
    ]);

    const rack = document.createElement("select");
    rack.className = "count-rack";
    rack.required = true;
    rack.add(new Option("Select rack", ""));

    racks.forEach(function (item) {
      const location = locations.find(
        (value) => value._id === item.locationId
      );

      if (!location) return;

      rack.add(new Option(
        location.name + " / " + item.rackCode,
        item._id
      ));
    });

    const qty = document.createElement("input");
    qty.className = "count-qty";
    qty.type = "number";
    qty.min = "1";
    qty.step = "1";
    qty.required = true;
    qty.value = "1";

    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Remove";

    remove.addEventListener("click", function () {
      if (busy) return;
      row.remove();
      updateCount();
    });

    [size, system, condition, rack, qty, remove].forEach(
      function (element) {
        const cell = document.createElement("td");
        cell.appendChild(element);
        row.appendChild(cell);
      }
    );

    rowsBody.appendChild(row);
    updateCount();
  }

  function renderBatches() {
    const search = document.getElementById("batchSearch")
      .value.trim().toUpperCase();

    batchSelect.replaceChildren(
      new Option("Select an unallocated batch", "")
    );

    batches.forEach(function (batch, index) {
      if (batch.completed) return;

      const label = [
        batch.brand,
        batch.articleName,
        batch.color,
        "MRP " + money(batch.mrpPaise || 0),
        "Cost " + money(batch.costPaise || 0),
        batch.qty + " pairs",
        batch.error ? "Needs review: " + batch.error : "",
      ].filter(Boolean).join(" · ");

      if (search && !label.toUpperCase().includes(search)) {
        return;
      }

      const option = new Option(label, String(index));
      option.disabled = !!batch.error;
      batchSelect.add(option);
    });

    if (selectedBatch) {
      const index = batches.indexOf(selectedBatch);
      batchSelect.value = String(index);

      if (batchSelect.value === "") {
        selectedBatch = null;
        rowsBody.replaceChildren();
        document.getElementById("batchInfo").textContent = "";
      }
    }

    updateCount();
  }

  function renderLocations() {
    locationBody.replaceChildren();

    locations.forEach(function (location) {
      const row = document.createElement("tr");
      const nameCell = document.createElement("td");
      const typeCell = document.createElement("td");
      const actionCell = document.createElement("td");

      nameCell.textContent = location.name;

      const select = document.createElement("select");

      appendOptions(select, [
        { value: "OTHER", label: "Not classified" },
        { value: "FRONT", label: "Front" },
        { value: "BASEMENT", label: "Basement" },
        { value: "RESERVE", label: "Reserve" },
        { value: "QUARANTINE", label: "Quarantine" },
      ]);

      select.value = location.locationType || "OTHER";

      const save = document.createElement("button");
      save.type = "button";
      save.textContent = "Save";

      save.addEventListener("click", async function () {
        if (busy || loading || save.disabled) return;

        const locationType = select.value;

        locationSaves += 1;
        save.disabled = true;
        select.disabled = true;
        updateCount();

        try {
          await api(BASE + "/locations/" + location._id, {
            method: "PATCH",
            body: JSON.stringify({ locationType }),
          });

          location.locationType = locationType;
          setMessage("Location classification saved.", false);
        } catch (error) {
          setMessage(error.message, true);
        } finally {
          locationSaves -= 1;
          save.disabled = false;
          select.disabled = false;
          updateCount();
        }
      });

      typeCell.appendChild(select);
      actionCell.appendChild(save);
      row.append(nameCell, typeCell, actionCell);
      locationBody.appendChild(row);
    });
  }

  async function load() {
    if (busy || loading || locationSaves) return;

    loading = true;
    setLocked(true);
    setMessage("Loading setup...", false);

    try {
      const result = await api(BASE + "/data");

      batches = result.data.batches;
      racks = result.data.racks;
      locations = result.data.locations;

      selectedBatch = null;
      rowsBody.replaceChildren();

      document.getElementById("batchInfo").textContent = "";

      renderLocations();
      renderBatches();

      setMessage(
        result.data.managed
          ? "Stock setup is in progress. Legacy stock writes are paused."
          : "Classify locations, then select a stock batch.",
        false
      );
    } catch (error) {
      selectedBatch = null;
      setMessage(error.message, true);
    } finally {
      loading = false;
      setLocked(false);
    }
  }

  batchSelect.addEventListener("change", function () {
    selectedBatch =
      this.value === "" ? null : batches[Number(this.value)];

    rowsBody.replaceChildren();

    document.getElementById("batchInfo").textContent =
      selectedBatch
        ? "Allocate every pair in this batch. Mixed conditions are allowed only when physically counted."
        : "";

    if (selectedBatch) addRow();
    updateCount();
  });

  document.getElementById("batchSearch")
    .addEventListener("input", renderBatches);

  rowsBody.addEventListener("input", updateCount);
  addButton.addEventListener("click", addRow);

  document.getElementById("reloadSetup")
    .addEventListener("click", function () {
      if (
        rowsBody.children.length &&
        !window.confirm("Discard the current unsaved allocation?")
      ) {
        return;
      }

      load();
    });

  document.getElementById("allocationForm")
    .addEventListener("submit", async function (event) {
      event.preventDefault();

      if (
        busy ||
        loading ||
        locationSaves ||
        !selectedBatch ||
        !this.reportValidity()
      ) {
        return;
      }

      const rows = Array.from(rowsBody.children).map(
        function (row) {
          return {
            size: row.querySelector(".count-size").value,
            sizeSystem: row.querySelector(".count-system").value,
            condition: row.querySelector(".count-condition").value,
            rackId: row.querySelector(".count-rack").value,
            qty: Number(row.querySelector(".count-qty").value),
          };
        }
      );

      const counted = rows.reduce(
        (sum, row) => sum + row.qty,
        0
      );

      if (
        rows.some((row) => !Number.isSafeInteger(row.qty) || row.qty < 1) ||
        counted !== selectedBatch.qty
      ) {
        setMessage("Counted pairs must exactly match the batch balance.", true);
        return;
      }

      if (!window.confirm(
        "Confirm the physical count and rack locations? " +
        "The ledger total will not change. Legacy stock writes " +
        "will be paused while migration is in progress."
      )) {
        return;
      }

      busy = true;
      setLocked(true);
      setMessage("Verifying allocation...", false);

      let saved = false;

      try {
        await api(BASE + "/verify", {
          method: "POST",
          body: JSON.stringify({
            articleId: selectedBatch.articleId,
            color: selectedBatch.color,
            mrp: selectedBatch.mrp,
            cost: selectedBatch.cost,
            rows,
          }),
        });

        saved = true;
      } catch (error) {
        setMessage(error.message, true);
      } finally {
        busy = false;
        setLocked(false);
      }

      if (saved) {
        await load();
        setMessage(
          "Allocation verified. Ledger total unchanged. Continue with the next batch.",
          false
        );
      }
    });

  load();
})();