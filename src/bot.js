    const embed = new EmbedBuilder()
      .setTitle("Test Completed")
      .setColor(0x9b7bff)
      .setThumbnail(`https://minotar.net/avatar/${encodeURIComponent(ign)}/64`)
      .addFields(
        { name: "Player", value: `\`${ign}\``, inline: true },
        { name: "Gamemode", value: `\`${mode.toUpperCase()}\``, inline: true },
        { name: "Tier", value: `\`${tier}\``, inline: true },
        { name: "Previous", value: "`-`", inline: true },
        { name: "Tester", value: `<@${tester}>`, inline: true },
        ...(notes ? [{ name: "Notes", value: `\`${notes.replace(/`/g,"'")}\`` }] : [])
      )
      .setTimestamp();
