    const embed = new EmbedBuilder()
      .setTitle("Test Result")
      .addFields(
        { name: "Player", value: `\`${ign}\``, inline: true },
        { name: "Gamemode", value: `\`${mode.toUpperCase()}\``, inline: true },
        { name: "Tier", value: `\`${tier}\``, inline: true },
        { name: "Tester", value: `<@${tester}>`, inline: true },
        ...(notes ? [{ name: "Notes", value: notes, inline: false }] : [])
      )
      .setColor(0x9b7bff)
      .setTimestamp()
      .setFooter({ text: "GalaxyTierlist • Test Completed" });
