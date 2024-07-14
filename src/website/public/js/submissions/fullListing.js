submissionsFunctions.hideSubmission.push(async (event, id) => {
  document.getElementById(`submission-${id}`).remove()
})

submissionsFunctions.hideAll.push(async (event, ids) => {
  for (let id of ids) document.getElementById(`submission-${id}`).remove()
})
