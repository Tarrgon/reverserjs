submissionsFunctions.removeSubmissionFromBacklog.push(async (event, id) => {
  document.getElementById(`submission-${id}`).remove()
})

submissionsFunctions.unbacklogAll.push(async (event, ids) => {
  for (let id of ids) document.getElementById(`submission-${id}`).remove()
})
