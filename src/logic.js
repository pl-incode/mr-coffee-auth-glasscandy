function getDayName(dayNumber) {
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    return days[dayNumber - 1];
};

function isIdValid(userId, ids, res) {
    if (isNaN(userId)) {
        res.status(404).render('user-page', { 'title': `Employee ID is not selected or the ID is not a number !` });
        return false;
    } else if (!ids.includes(userId)) {
        res.status(404).render('user-page', { 'title': `There is no employee with ID: ${userId} !` });
        return false;
    };
    return true;
};

module.exports = {
    getDayName: getDayName,
    isIdValid: isIdValid
};
