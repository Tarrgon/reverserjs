function changeFile(event) {
  let file = event.target.files[0]

  if (!file) return

  document.getElementById("file-name").innerText = file.name
}

const template = 
`
<div id="submission-card-<%-submission.id%>" class="card" style="border-radius: 0; border-radius: var(--bulma-card-radius) var(--bulma-card-radius) 0 0;">
  <a href="/submissions/<%-submission.id%>">
    <div class="card-image">
      <figure class="image" onclick="preview(event, '<%- submission.extension %>', '<%- submission.getWebPath() %>')">
        <img src="<%- submission.getThumbnailWebPath() %>" style="border-end-end-radius: 0; border-end-start-radius: 0;" />
      </figure>
    </div>
  </a>
  <footer class="card-footer" style="min-height: 2em;">
    <div class="has-text-centered" style="margin-right: auto; margin-left: auto;">
      <% if (includeScore) {%>
      <span>Similarity: <%- (Math.ceil(submission.hit.score*20 - 0.5)/20).toFixed(2) %></span>
      <br />
      <% if (options.primarySubmission.md5 == submission.md5) { %>
      <span class="has-text-light is-size-7">MD5 Match</span>
      <br />
      <% } %>
      <% } %>
      <span class="site-icon-wrapper">
        <a title="<%- submission.aggregator?.displayName %> - <%- submission.artistUrlReference.urlIdentifier %>" href="<%- submission.artistUrlReference.url %>">
          <span class="site-icon" style="--icon-index: <%- submission.aggregator?.index %>"></span>
        </a>
      </span>
      <span><%- submission.width %>x<%- submission.height %>, </span>
      <span><%- submission.getHumanFileSize() %>, </span>
      <span><%- submission.extension.toUpperCase() %></span>
      <br />
      <span datetime="<%- submission.creationDate.toString() %>"><%- submission.dateTime.toRelative() %></span>
      <i class="fa-solid fa-grip-lines-vertical"></i>
      <i class="fa-solid fa-download has-text-success" title="Update E6 Post Data" style="cursor: pointer;" onclick="updateSubmissionE621Iqdb(event, <%- submission.id %>)"></i>
      <br />
      <span class="has-text-info"><a href="<%- {sourceUrl} %>" target="_blank">SRC</a></span>
      <i class="fa-solid fa-grip-lines-vertical"></i>
      <span class="has-text-info"><a href="<%- {directLinkOffsite} %>" target="_blank">DLE</a></span>
      <i class="fa-solid fa-grip-lines-vertical"></i>
      <span class="has-text-info"><a href="<%- {webPath} %>" target="_blank">DLO</a></span>
    </div>
  </footer>
</div>
`.trim()

async function search() {
  let file = document.getElementById("file").files[0]
  let url = document.getElementById("url")

  let data = new FormData()
  data.append("scoreCutoff", document.getElementById("score-cutoff").value)

  if (!file) {
    data.append("url", url.value)
  } else {
    data.append("file", file)
  }

  let res = await fetch("/search", {
    method: "POST",
    body: data
  })

  let hits = await res.json()

  if (hits.length == 0) return alert("No matches")

  window.location.href = `/submissions/multiview?ids=${hits.map(h => h.id).join(",")}`
}